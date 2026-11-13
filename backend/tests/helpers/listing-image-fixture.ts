import sharp from "sharp";

/** Tạo JPEG hợp lệ có độ dài/payload APP15 tạo chuỗi ftyp tại vị trí nhận diện BMFF. */
export async function jpegWithFtypAppSegment(): Promise<Buffer> {
  const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } })
    .jpeg()
    .toBuffer();
  const segment = Buffer.alloc(0x6674 + 2);
  segment[0] = 0xff;
  segment[1] = 0xef;
  segment.writeUInt16BE(0x6674, 2);
  segment[4] = 0x79;
  segment[5] = 0x70;
  return Buffer.concat([jpeg.subarray(0, 2), segment, jpeg.subarray(2)]);
}
