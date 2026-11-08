/**
 * TachibkService — Decodificador e Parser Completo para backups do Tachiyomi e Mihon (.tachibk / .proto.gz)
 *
 * Arquivos .tachibk são arquivos comprimidos em GZIP contendo mensagens binárias do Protocol Buffers (protobuf)
 * baseadas no schema `backup.proto` do Tachiyomi / Mihon.
 */

export interface TachiyomiMangaBackup {
  source: string;
  url: string;
  title: string;
  artist?: string;
  author?: string;
  description?: string;
  genre: string[];
  status: number;
  thumbnailUrl?: string;
  categories: (string | number)[];
  chapters: {
    url: string;
    name: string;
    read: boolean;
    chapterNumber: number;
    lastPageRead?: number;
  }[];
}

export interface TachiyomiCategoryBackup {
  name: string;
  order: number;
}

export interface TachiyomiParsedBackup {
  mangas: TachiyomiMangaBackup[];
  categories: TachiyomiCategoryBackup[];
  sourceCount: number;
}

/**
 * Leitor determinístico de Protocol Buffers (Wire Format) sem dependências externas.
 */
export class ProtoReader {
  private view: Uint8Array;
  private pos: number = 0;

  constructor(buffer: ArrayBuffer | Uint8Array) {
    this.view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  }

  hasMore(): boolean {
    return this.pos < this.view.length;
  }

  getPosition(): number {
    return this.pos;
  }

  readVarint(): number {
    let result = 0;
    let shift = 0;
    while (this.pos < this.view.length) {
      const byte = this.view[this.pos++];
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
      if (shift > 35) {
        // Ignora bytes remanescentes de inteiros de 64 bits para evitar overflow
        while (this.pos < this.view.length && (this.view[this.pos++] & 0x80) !== 0) {}
        break;
      }
    }
    return result;
  }

  readVarintString(): string {
    let result = 0n;
    let shift = 0n;
    while (this.pos < this.view.length) {
      const byte = BigInt(this.view[this.pos++]);
      result |= (byte & 0x7fn) << shift;
      if ((byte & 0x80n) === 0n) break;
      shift += 7n;
    }
    return result.toString();
  }

  readTag(): { field: number; wireType: number } | null {
    if (!this.hasMore()) return null;
    const tag = this.readVarint();
    return {
      field: tag >>> 3,
      wireType: tag & 0x07
    };
  }

  readBytes(): Uint8Array {
    const len = this.readVarint();
    const bytes = this.view.subarray(this.pos, this.pos + len);
    this.pos += len;
    return bytes;
  }

  readString(): string {
    const bytes = this.readBytes();
    try {
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch {
      return '';
    }
  }

  readFloat32(): number {
    if (this.pos + 4 > this.view.length) return 0;
    const dv = new DataView(this.view.buffer, this.view.byteOffset + this.pos, 4);
    const val = dv.getFloat32(0, true);
    this.pos += 4;
    return val;
  }

  skip(wireType: number) {
    if (wireType === 0) {
      this.readVarint();
    } else if (wireType === 1) {
      this.pos += 8;
    } else if (wireType === 2) {
      const len = this.readVarint();
      this.pos += len;
    } else if (wireType === 5) {
      this.pos += 4;
    }
  }
}

/**
 * Parseia um bloco protobuf correspondente a BackupChapter
 */
export function parseBackupChapter(bytes: Uint8Array) {
  const cr = new ProtoReader(bytes);
  let url = '';
  let name = '';
  let read = false;
  let chapterNumber = 0;
  let lastPageRead = 0;

  while (cr.hasMore()) {
    const tag = cr.readTag();
    if (!tag) break;
    switch (tag.field) {
      case 1:
        url = cr.readString();
        break;
      case 2:
        name = cr.readString();
        break;
      case 4:
        read = cr.readVarint() !== 0;
        break;
      case 6:
        lastPageRead = cr.readVarint();
        break;
      case 9:
        if (tag.wireType === 5) {
          chapterNumber = cr.readFloat32();
        } else {
          chapterNumber = cr.readVarint();
        }
        break;
      default:
        cr.skip(tag.wireType);
        break;
    }
  }

  return { url, name, read, chapterNumber, lastPageRead };
}

/**
 * Parseia um bloco protobuf correspondente a BackupCategory
 */
export function parseBackupCategory(bytes: Uint8Array): TachiyomiCategoryBackup {
  const catReader = new ProtoReader(bytes);
  let name = '';
  let order = 0;

  while (catReader.hasMore()) {
    const tag = catReader.readTag();
    if (!tag) break;
    if (tag.field === 1 && tag.wireType === 2) {
      name = catReader.readString();
    } else if (tag.field === 2 && tag.wireType === 0) {
      order = catReader.readVarint();
    } else {
      catReader.skip(tag.wireType);
    }
  }

  return { name, order };
}

/**
 * Parseia um bloco protobuf correspondente a BackupManga
 */
export function parseBackupManga(bytes: Uint8Array): TachiyomiMangaBackup {
  const mr = new ProtoReader(bytes);
  let source = '';
  let url = '';
  let title = '';
  let artist = '';
  let author = '';
  let description = '';
  const genre: string[] = [];
  let status = 1;
  let thumbnailUrl = '';
  const chapters: any[] = [];
  const categories: (string | number)[] = [];

  while (mr.hasMore()) {
    const tag = mr.readTag();
    if (!tag) break;

    switch (tag.field) {
      case 1:
        source = mr.readVarintString();
        break;
      case 2:
        url = mr.readString();
        break;
      case 3:
        title = mr.readString();
        break;
      case 4:
        artist = mr.readString();
        break;
      case 5:
        author = mr.readString();
        break;
      case 6:
        description = mr.readString();
        break;
      case 7:
        genre.push(mr.readString());
        break;
      case 8:
        status = mr.readVarint();
        break;
      case 9:
        thumbnailUrl = mr.readString();
        break;
      case 16: {
        const chBytes = mr.readBytes();
        chapters.push(parseBackupChapter(chBytes));
        break;
      }
      case 17: {
        if (tag.wireType === 2) {
          const catBytes = mr.readBytes();
          const cr = new ProtoReader(catBytes);
          while (cr.hasMore()) categories.push(cr.readVarint());
        } else {
          categories.push(mr.readVarint());
        }
        break;
      }
      default:
        mr.skip(tag.wireType);
        break;
    }
  }

  return {
    source,
    url,
    title,
    artist,
    author,
    description,
    genre,
    status,
    thumbnailUrl,
    categories,
    chapters
  };
}

/**
 * Descomprime um Uint8Array ou ArrayBuffer GZIP usando DecompressionStream nativo do navegador
 */
export async function decompressGzip(buffer: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  const inputBytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // Checa magic bytes do cabeçalho GZIP: 0x1F, 0x8B
  const isGzip = inputBytes.length >= 2 && inputBytes[0] === 0x1f && inputBytes[1] === 0x8b;
  if (!isGzip) {
    return inputBytes;
  }

  // Tenta DecompressionStream nativo
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(inputBytes);
          controller.close();
        }
      });
      const decompressed = stream.pipeThrough(new DecompressionStream('gzip'));
      const reader = decompressed.getReader();
      const chunks: Uint8Array[] = [];
      let totalLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          totalLength += value.length;
        }
      }

      const merged = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      return merged;
    } catch (e) {
      console.warn('DecompressionStream falhou, tentando fallback via API local:', e);
    }
  }

  // Fallback: via API backend /api/backup/decompress
  try {
    const res = await fetch('/api/backup/decompress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Blob([inputBytes as BlobPart])
    });
    if (res.ok) {
      const ab = await res.arrayBuffer();
      return new Uint8Array(ab);
    }
  } catch (err) {
    console.warn('Fallback de descompressão no servidor falhou:', err);
  }

  throw new Error('Não foi possível descomprimir o arquivo .tachibk. Verifique se o arquivo está corrompido.');
}

export interface TachibkProgressInfo {
  percent: number;
  stage: 'reading' | 'decompressing' | 'decoding' | 'merging' | 'completed' | 'error';
  stageLabel: string;
  currentItem?: string;
  currentCount?: number;
  totalCount?: number;
}

export type TachibkProgressCallback = (info: TachibkProgressInfo) => void;

/**
 * Parser de alto nível para arquivos .tachibk ou .proto.gz do Mihon/Tachiyomi
 * com suporte a feedback de progresso e liberação do event loop para o navegador.
 */
export async function parseTachibk(
  fileOrBuffer: File | ArrayBuffer | Uint8Array,
  onProgress?: TachibkProgressCallback
): Promise<TachiyomiParsedBackup> {
  onProgress?.({
    percent: 5,
    stage: 'reading',
    stageLabel: 'Carregando arquivo de backup na memória...'
  });

  let rawBytes: Uint8Array;

  if (fileOrBuffer instanceof File) {
    const ab = await fileOrBuffer.arrayBuffer();
    rawBytes = new Uint8Array(ab);
  } else if (fileOrBuffer instanceof ArrayBuffer) {
    rawBytes = new Uint8Array(fileOrBuffer);
  } else {
    rawBytes = fileOrBuffer;
  }

  onProgress?.({
    percent: 15,
    stage: 'decompressing',
    stageLabel: 'Descomprimindo arquivo GZIP (.tachibk)...'
  });

  // Dá um frame para a UI renderizar o status de descompressão
  await new Promise(r => setTimeout(r, 10));

  // 1. Descomprime GZIP
  const decompressed = await decompressGzip(rawBytes);

  onProgress?.({
    percent: 30,
    stage: 'decoding',
    stageLabel: 'Analisando formato interno (Protobuf / JSON)...'
  });

  // 2. Checa se é JSON legado ou protobuf binário
  const firstByte = decompressed[0];
  if (firstByte === 0x7b /* '{' */ || firstByte === 0x5b /* '[' */) {
    try {
      const text = new TextDecoder('utf-8').decode(decompressed);
      const json = JSON.parse(text);
      const mangas = json.mangas || json.backupManga || [];
      const categories = json.categories || json.backupCategories || [];
      onProgress?.({
        percent: 75,
        stage: 'decoding',
        stageLabel: `Decodificado JSON legado com ${mangas.length} obras.`,
        currentCount: mangas.length,
        totalCount: mangas.length
      });
      return {
        mangas,
        categories,
        sourceCount: mangas.length
      };
    } catch (e) {
      console.warn('Falha ao ler JSON interno de .tachibk, tentando protobuf:', e);
    }
  }

  // 3. Decodifica Protocol Buffers com atualização progressiva e liberação do loop
  const totalBytes = decompressed.length;
  const rootReader = new ProtoReader(decompressed);
  const mangas: TachiyomiMangaBackup[] = [];
  const categories: TachiyomiCategoryBackup[] = [];
  let lastReportedTime = Date.now();

  while (rootReader.hasMore()) {
    const tag = rootReader.readTag();
    if (!tag) break;

    // Campo 1: repeated BackupManga backupManga
    if (tag.field === 1 && tag.wireType === 2) {
      const mangaBytes = rootReader.readBytes();
      try {
        const manga = parseBackupManga(mangaBytes);
        if (manga && manga.title) {
          mangas.push(manga);

          // Atualiza progresso proporcional à posição do leitor de bytes (30% a 75%)
          const now = Date.now();
          const shouldYield = mangas.length % 15 === 0 || (now - lastReportedTime > 60);

          if (shouldYield && onProgress) {
            const bytePos = rootReader.getPosition();
            const ratio = totalBytes > 0 ? Math.min(1, bytePos / totalBytes) : 0;
            const pct = Math.min(74, Math.round(30 + ratio * 44));

            onProgress({
              percent: pct,
              stage: 'decoding',
              stageLabel: `Decodificando catálogo do Mihon (${mangas.length} obras lidas)...`,
              currentItem: manga.title,
              currentCount: mangas.length
            });
            lastReportedTime = now;
            // Libera o event loop para atualizar animação da barra de progresso no React
            await new Promise(r => setTimeout(r, 0));
          }
        }
      } catch (err) {
        console.warn('Erro ao decodificar manga individual:', err);
      }
    }
    // Campo 2: repeated BackupCategory backupCategories
    else if (tag.field === 2 && tag.wireType === 2) {
      const catBytes = rootReader.readBytes();
      try {
        const cat = parseBackupCategory(catBytes);
        if (cat && cat.name) {
          categories.push(cat);
        }
      } catch (err) {
        console.warn('Erro ao decodificar categoria individual:', err);
      }
    } else {
      rootReader.skip(tag.wireType);
    }
  }

  onProgress?.({
    percent: 75,
    stage: 'decoding',
    stageLabel: `Decodificação finalizada: ${mangas.length} obras e ${categories.length} categorias encontradas.`,
    currentCount: mangas.length,
    totalCount: mangas.length
  });

  return {
    mangas,
    categories,
    sourceCount: mangas.length
  };
}
