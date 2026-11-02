param(
  [Parameter(Mandatory = $true)][string]$PgBin,
  [int]$Port = 55484,
  [switch]$FullStack,
  [switch]$FullStackOnly,
  [string]$BrowserGrep
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$testRoot = Join-Path $repoRoot '.local/postgres-integration'
$marker = Join-Path $testRoot 'CSMS_TEST_CLUSTER'
$databaseName = 'csms_test_' + (Get-Date -Format 'yyyyMMdd_HHmmss_fff')
$startedHere = $false
$databaseCreated = $false
$restoreCreated = $false
$restoreDatabase = $databaseName + '_restored'
$fixtureProcess = $null
if ($FullStackOnly) { $FullStack = $true }

function Invoke-PostgresCommand([string]$CommandName, [string[]]$Arguments) {
  & (Join-Path $PgBin $CommandName) @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$CommandName failed with exit code $LASTEXITCODE" }
}

if ((Test-Path (Join-Path $testRoot 'PG_VERSION')) -and -not (Test-Path $marker)) {
  throw 'Refusing to use an existing cluster without the CSMS_TEST_CLUSTER marker.'
}
if (-not (Test-Path (Join-Path $testRoot 'PG_VERSION'))) {
  Invoke-PostgresCommand 'initdb.exe' @('-D', $testRoot, '-A', 'trust', '-U', 'csms_test', '--no-locale', '-E', 'UTF8')
  Set-Content -LiteralPath $marker -Value 'Isolated CSMS test cluster; not application data.'
}

try {
  & (Join-Path $PgBin 'pg_ctl.exe') -D $testRoot status 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Invoke-PostgresCommand 'pg_ctl.exe' @('-D', $testRoot, '-l', (Join-Path $repoRoot '.local/postgres-integration.log'), '-o', "-p $Port -h 127.0.0.1", '-w', 'start')
    $startedHere = $true
  }
  # Confirm the server on this port owns this isolated data directory.
  $actualDirectory = & (Join-Path $PgBin 'psql.exe') -X -h 127.0.0.1 -p $Port -U csms_test -d postgres -Atc 'show data_directory'
  if ($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($actualDirectory.Trim()) -ne [IO.Path]::GetFullPath($testRoot)) {
    throw 'The selected port does not belong to this isolated test cluster.'
  }
  Invoke-PostgresCommand 'createdb.exe' @('-h', '127.0.0.1', '-p', "$Port", '-U', 'csms_test', $databaseName)
  $databaseCreated = $true
  $sqlFiles = @((Join-Path $repoRoot 'tests/database/bootstrap.sql'))
  $sqlFiles += Get-ChildItem -LiteralPath (Join-Path $repoRoot 'supabase/migrations') -Filter '*.sql' | Sort-Object Name | ForEach-Object FullName
  if (-not $FullStackOnly) {
    $sqlFiles += Join-Path $repoRoot 'tests/database/menu-security.sql'
    $sqlFiles += Join-Path $repoRoot 'tests/database/preopening-seed.sql'
    $sqlFiles += Join-Path $repoRoot 'tests/database/inventory-purchasing.sql'
    $sqlFiles += Join-Path $repoRoot 'tests/database/pos-finance.sql'
  }
  foreach ($sqlFile in $sqlFiles) {
    Invoke-PostgresCommand 'psql.exe' @('-X', '-h', '127.0.0.1', '-p', "$Port", '-U', 'csms_test', '-d', $databaseName, '-v', 'ON_ERROR_STOP=1', '-f', $sqlFile)
  }
  # Restore a real custom-format dump into another disposable database. This is
  # an isolated integrity drill; it never connects to the configured Supabase.
  $dumpFile = Join-Path $repoRoot ('.local/' + $databaseName + '.dump')
  Invoke-PostgresCommand 'pg_dump.exe' @('-h','127.0.0.1','-p',"$Port",'-U','csms_test','-Fc','--no-owner','-f',$dumpFile,$databaseName)
  Invoke-PostgresCommand 'createdb.exe' @('-h','127.0.0.1','-p',"$Port",'-U','csms_test',$restoreDatabase)
  $restoreCreated = $true
  Invoke-PostgresCommand 'pg_restore.exe' @('-h','127.0.0.1','-p',"$Port",'-U','csms_test','--exit-on-error','--no-owner','-d',$restoreDatabase,$dumpFile)
  $restoreCheck = "select (select count(*) from public.audit_logs)::text || ':' || (select count(*) from public.products)::text || ':' || (select count(*) from pg_policies)::text || ':' || (select count(*) from pg_trigger where not tgisinternal)::text"
  $sourceSignature = & (Join-Path $PgBin 'psql.exe') -X -h 127.0.0.1 -p $Port -U csms_test -d $databaseName -Atc $restoreCheck
  if ($LASTEXITCODE -ne 0) { throw 'Source restore signature failed' }
  $restoredSignature = & (Join-Path $PgBin 'psql.exe') -X -h 127.0.0.1 -p $Port -U csms_test -d $restoreDatabase -Atc $restoreCheck
  if ($LASTEXITCODE -ne 0 -or $sourceSignature -ne $restoredSignature) { throw 'Restored row/policy/trigger signature differs' }
  Write-Output 'PASS: isolated pg_dump/pg_restore drill retained business rows, RLS policies and history triggers'
  if ($FullStack) {
    Invoke-PostgresCommand 'psql.exe' @('-X','-h','127.0.0.1','-p',"$Port",'-U','csms_test','-d',$databaseName,'-v','ON_ERROR_STOP=1','-f',(Join-Path $repoRoot 'tests/database/fullstack-fixture.sql'))
    $env:CSMS_TEST_DB=$databaseName
    $env:CSMS_TEST_PG_BIN=$PgBin
    $env:CSMS_TEST_PG_PORT="$Port"
    $savedSupabaseUrl=$env:NEXT_PUBLIC_SUPABASE_URL
    $savedSupabaseKey=$env:NEXT_PUBLIC_SUPABASE_ANON_KEY
    $savedAppUrl=$env:APP_URL
    $savedServerSupabaseUrl=$env:SUPABASE_URL
    $savedServerSupabaseKey=$env:SUPABASE_ANON_KEY
    try {
      $env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:55486'
      $env:NEXT_PUBLIC_SUPABASE_ANON_KEY='isolated-test-public-key'
      $env:APP_URL='http://127.0.0.1:3001'
      $env:SUPABASE_URL='http://127.0.0.1:55486'
      $env:SUPABASE_ANON_KEY='isolated-test-public-key'
      $fixtureProcess=Start-Process -FilePath (Get-Command node).Source -ArgumentList @((Join-Path $repoRoot 'scripts/fullstack-supabase-fixture.mjs')) -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $repoRoot '.local/fullstack-fixture.log') -RedirectStandardError (Join-Path $repoRoot '.local/fullstack-fixture-error.log')
      $browserArguments=@('playwright','test','--config','playwright.fullstack.config.ts')
      if ($BrowserGrep) { $browserArguments+=@('--grep',$BrowserGrep) }
      & (Join-Path (Split-Path (Get-Command node).Source) 'npx.cmd') @browserArguments
      if ($LASTEXITCODE -ne 0) { throw 'Authenticated browser/database integration failed' }
    } finally {
      $env:NEXT_PUBLIC_SUPABASE_URL=$savedSupabaseUrl
      $env:NEXT_PUBLIC_SUPABASE_ANON_KEY=$savedSupabaseKey
      $env:APP_URL=$savedAppUrl
      $env:SUPABASE_URL=$savedServerSupabaseUrl
      $env:SUPABASE_ANON_KEY=$savedServerSupabaseKey
      Remove-Item Env:CSMS_TEST_DB,Env:CSMS_TEST_PG_BIN,Env:CSMS_TEST_PG_PORT -ErrorAction SilentlyContinue
    }
  }
} finally {
  if ($null -ne $fixtureProcess -and -not $fixtureProcess.HasExited) { Stop-Process -Id $fixtureProcess.Id }
  if ($restoreCreated) { Invoke-PostgresCommand 'dropdb.exe' @('-h', '127.0.0.1', '-p', "$Port", '-U', 'csms_test', $restoreDatabase) }
  if ($databaseCreated) { Invoke-PostgresCommand 'dropdb.exe' @('-h', '127.0.0.1', '-p', "$Port", '-U', 'csms_test', $databaseName) }
  if ($startedHere) { Invoke-PostgresCommand 'pg_ctl.exe' @('-D', $testRoot, '-w', 'stop') }
}
