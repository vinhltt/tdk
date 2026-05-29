import { createHash } from 'node:crypto';
import * as fs from 'node:fs';

export function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
