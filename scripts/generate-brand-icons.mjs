import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

// Preserve the complete supplied artwork; do not crop or invent an icon-only mark.
const source = process.argv[2] ?? "public/images/Logo.png";
const output = "public/brand";
await mkdir(output, { recursive: true });
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(size => sharp(source).resize(size, size, { fit: "contain" }).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((image, index) => {
  const entry = 6 + 16 * index;
  header[entry] = sizes[index];
  header[entry + 1] = sizes[index];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(image.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
await writeFile(`${output}/favicon.ico`, Buffer.concat([header, ...images]));
await Promise.all([[192, "icon-192.png"], [180, "apple-touch-icon.png"]].map(([size, name]) =>
  sharp(source).resize(size, size, { fit: "contain" }).png().toFile(`${output}/${name}`),
));
