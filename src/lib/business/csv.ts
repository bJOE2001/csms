/** Quote CSV fields and keep untrusted text from becoming spreadsheet formulas. */
export function csvCell(value:unknown):string {
  let result=value===null||value===undefined?"":String(value);
  if(typeof value!=="number"&&(/^[\s]*[=+@-]/.test(result)||/^[\t\r]/.test(result)))result=`'${result}`;
  return `"${result.replaceAll('"','""')}"`;
}
