import { BadRequestException } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';

type XmlObject = Record<string, unknown>;

function node(value: unknown): XmlObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as XmlObject)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Reads image only for storage. Never return these values in preview JSON or logs. */
export function extractStudentPhotoMap(
  buffer: Buffer,
  rootName: 'BAO_CAO1' | 'SAT_HACH',
): Map<string, string> {
  const xml = buffer.toString('utf8').replace(/^\uFEFF/, '');

  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new BadRequestException('Không hỗ trợ DTD hoặc ENTITY trong XML.');
  }

  const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    trimValues: true,
    processEntities: false,
  });

  const root = node(parser.parse(xml));
  const data = node(node(root[rootName]).DATA);
  const raw = node(data.NGUOI_LXS).NGUOI_LX;
  const people = Array.isArray(raw) ? raw : raw ? [raw] : [];

  const photos = new Map<string, string>();

  for (const item of people) {
    const person = node(item);
    const dossier = node(person.HO_SO);
    const registrationCode = stringValue(person.MA_DK);

    if (!registrationCode) continue;

    const base64 =
      stringValue(dossier.ANH_CHAN_DUNG) ??
      stringValue(person.ANH_CHAN_DUNG) ??
      stringValue(dossier.DUONG_DAN_ANH) ??
      stringValue(person.DUONG_DAN_ANH);

    if (base64) photos.set(registrationCode, base64);
  }

  return photos;
}
