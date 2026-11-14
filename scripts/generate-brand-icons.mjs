import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

// Temporary text identity only: no pictorial logo has been supplied.
const output = "public/brand";
await mkdir(output, { recursive: true });
const source = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="Sip&amp;Snap">
  <title>Sip&amp;Snap</title>
  <rect width="512" height="512" fill="#FAF7F3"/>
  <text x="256" y="280" text-anchor="middle" font-family="Manrope, Arial, sans-serif" font-size="78" font-weight="700" fill="#3B1B12">Sip&amp;Snap</text>
</svg>
`;
await writeFile(`${output}/text-icon.svg`, source);
await Promise.all([[192, "text-icon-192.png"], [512, "text-icon-512.png"], [180, "text-apple-touch-icon.png"]].map(([size, name]) =>
  sharp(Buffer.from(source)).resize(size, size).png().toFile(`${output}/${name}`),
));
