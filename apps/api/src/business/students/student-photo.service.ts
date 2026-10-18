import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { DataSource, EntityManager } from 'typeorm';

const execFileAsync = promisify(execFile);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type StudentPhotoSource = 'BC1' | 'BC2' | 'EXAM_LIST' | 'EXAM_RESULT';

export type StudentPhotoFile = {
  content: Buffer;
  mimeType: string;
};

@Injectable()
export class StudentPhotoService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private get storageRoot(): string {
    return resolve(
      process.env.STUDENT_PHOTO_STORAGE_PATH ??
        resolve(process.cwd(), '../../storage/students'),
    );
  }

  private decode(base64: string): Buffer {
    const normalized = base64
      .trim()
      .replace(/^data:image\/[^;]+;base64,/i, '')
      .replace(/\s+/g, '');

    if (!normalized) {
      throw new BadRequestException('Ảnh Base64 rỗng.');
    }

    if (
      normalized.length > MAX_IMAGE_BYTES * 1.4 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) ||
      normalized.length % 4 === 1
    ) {
      throw new BadRequestException('Dữ liệu ảnh Base64 không hợp lệ.');
    }

    const content = Buffer.from(normalized, 'base64');

    if (
      !content.length ||
      content.length > MAX_IMAGE_BYTES ||
      content.toString('base64').replace(/=+$/, '') !==
        normalized.replace(/=+$/, '')
    ) {
      throw new BadRequestException('Ảnh Base64 không hợp lệ.');
    }

    return content;
  }

  private imageFormat(data: Buffer): 'jpeg' | 'png' | 'jp2' {
    if (
      data.length >= 3 &&
      data[0] === 0xff &&
      data[1] === 0xd8 &&
      data[2] === 0xff
    ) {
      return 'jpeg';
    }

    if (
      data.length >= 8 &&
      data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      return 'png';
    }

    const jp2Signature = Buffer.from([
      0, 0, 0, 12, 106, 80, 32, 32, 13, 10, 135, 10,
    ]);

    if (data.length >= 12 && data.subarray(0, 12).equals(jp2Signature)) {
      return 'jp2';
    }

    throw new BadRequestException(
      'Ảnh không thuộc định dạng JPEG, PNG hoặc JP2.',
    );
  }

  private async convertJp2(data: Buffer): Promise<Buffer> {
    const temporary = await mkdtemp(join(tmpdir(), 'student-photo-'));

    const source = join(temporary, 'input.jp2');
    const output = join(temporary, 'output.png');

    try {
      await writeFile(source, data, { flag: 'wx', mode: 0o600 });

      await execFileAsync('opj_decompress', ['-i', source, '-o', output], {
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      });

      const converted = await readFile(output);

      if (
        !converted.length ||
        converted.length > MAX_IMAGE_BYTES ||
        this.imageFormat(converted) !== 'png'
      ) {
        throw new Error('Ảnh sau chuyển đổi không hợp lệ.');
      }

      return converted;
    } catch {
      throw new BadRequestException(
        'Không thể chuyển đổi ảnh JP2. Kiểm tra OpenJPEG trên Backend.',
      );
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }

  private async prepare(base64: string): Promise<StudentPhotoFile> {
    let content = this.decode(base64);
    const format = this.imageFormat(content);

    if (format === 'jp2') {
      content = await this.convertJp2(content);
    }

    return {
      content,
      mimeType: format === 'jpeg' ? 'image/jpeg' : 'image/png',
    };
  }

  async saveBase64(
    manager: EntityManager,
    params: {
      studentId: number;
      base64: string | null | undefined;
      sourceType: StudentPhotoSource;
      importBatchId?: number | null;
    },
  ): Promise<{ photoId: number; created: boolean } | null> {
    if (!params.base64?.trim()) return null;

    const { content, mimeType } = await this.prepare(params.base64);

    const sha256 = createHash('sha256').update(content).digest('hex');

    const extension = mimeType === 'image/jpeg' ? 'jpg' : 'png';
    const relativeKey = `${sha256.slice(0, 2)}/${sha256}.${extension}`;
    const directory = join(this.storageRoot, sha256.slice(0, 2));
    const destination = join(directory, `${sha256}.${extension}`);

    await mkdir(directory, { recursive: true, mode: 0o700 });

    const temporaryFile = join(directory, `.${randomUUID()}.tmp`);

    try {
      // Không mở công khai thư mục lưu ảnh.
      await writeFile(temporaryFile, content, {
        flag: 'wx',
        mode: 0o600,
      });

      try {
        await stat(destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }

        await rename(temporaryFile, destination);
      }
    } finally {
      await rm(temporaryFile, { force: true });
    }

    const existing: Array<{ id: number }> = await manager.query(
      `
        SELECT id FROM student_photos
        WHERE student_id = $1 AND sha256 = $2
        `,
      [params.studentId, sha256],
    );

    const rows: Array<{ id: number }> = await manager.query(
      `
        INSERT INTO student_photos (
          student_id,
          sha256,
          storage_key,
          mime_type,
          size_bytes,
          source_type,
          import_batch_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (student_id, sha256)
        DO UPDATE SET id = student_photos.id
        RETURNING id
        `,
      [
        params.studentId,
        sha256,
        relativeKey,
        mimeType,
        content.length,
        params.sourceType,
        params.importBatchId ?? null,
      ],
    );

    const photoId = Number(rows[0].id);

    await manager.query(
      `
        UPDATE students
        SET photo_id = $2,
            updated_at = NOW()
        WHERE id = $1
        `,
      [params.studentId, photoId],
    );

    return {
      photoId,
      created: existing.length === 0,
    };
  }

  async getStudentPhoto(studentId: number): Promise<StudentPhotoFile> {
    const rows: Array<{
      storageKey: string;
      mimeType: string;
    }> = await this.dataSource.query(
      `
        SELECT
          p.storage_key AS "storageKey",
          p.mime_type AS "mimeType"
        FROM students s
        JOIN student_photos p ON p.id = s.photo_id
        WHERE s.id = $1
        `,
      [studentId],
    );

    if (!rows.length) {
      throw new NotFoundException('Học viên chưa có ảnh đại diện.');
    }

    const key = rows[0].storageKey;

    if (!/^[0-9a-f]{2}\/[0-9a-f]{64}\.(jpg|png)$/.test(key)) {
      throw new InternalServerErrorException(
        'Đường dẫn lưu trữ ảnh không hợp lệ.',
      );
    }

    const filePath = resolve(this.storageRoot, key);

    if (!filePath.startsWith(this.storageRoot + sep)) {
      throw new InternalServerErrorException('Đường dẫn ảnh không hợp lệ.');
    }

    try {
      return {
        content: await readFile(filePath),
        mimeType: rows[0].mimeType,
      };
    } catch {
      throw new NotFoundException('File ảnh không còn trong kho lưu trữ.');
    }
  }
}
