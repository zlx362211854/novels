import { Sequelize } from 'sequelize';

const VECTOR_DIMENSION = 1024;
const VECTOR_EXTENSION_LOADED = Symbol('sqlite_vec_extension_loaded');
const CHAPTER_CHUNK_VECTOR_TABLE_STATEMENT =
  `CREATE VIRTUAL TABLE IF NOT EXISTS chapter_chunk_vec USING vec0(chunk_id integer, embedding float[${VECTOR_DIMENSION}])`;
const VECTOR_TABLE_STATEMENTS = [
  CHAPTER_CHUNK_VECTOR_TABLE_STATEMENT,
  `CREATE VIRTUAL TABLE IF NOT EXISTS story_bible_vec USING vec0(entry_id integer, embedding float[${VECTOR_DIMENSION}])`,
];

function getSqliteVecModule(): null | {
  load?: (db: unknown) => void;
  getLoadablePath?: () => string;
  path?: string;
} {
  try {
    return require('sqlite-vec');
  } catch (_error) {
    return null;
  }
}

async function withRawConnection<T>(
  sequelize: Sequelize,
  callback: (connection: any) => Promise<T>,
): Promise<T> {
  const connectionManager = sequelize.connectionManager as any;
  const connection = await connectionManager.getConnection({ type: 'write' });
  try {
    return await callback(connection);
  } finally {
    await connectionManager.releaseConnection(connection);
  }
}

async function runSql(connection: any, statement: string): Promise<void> {
  if (typeof connection.exec === 'function') {
    await new Promise<void>((resolve, reject) => {
      connection.exec(statement, (error: Error | null) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    return;
  }

  if (typeof connection.run === 'function') {
    await new Promise<void>((resolve, reject) => {
      connection.run(statement, (error: Error | null) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    return;
  }

  throw new Error('Current SQLite connection does not support executing SQL statements');
}

async function runSqlWithParams(connection: any, statement: string, params: unknown[]): Promise<void> {
  if (typeof connection.run === 'function') {
    await new Promise<void>((resolve, reject) => {
      connection.run(statement, params, (error: Error | null) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    return;
  }

  throw new Error('Current SQLite connection does not support executing parameterized SQL statements');
}

async function fetchAllWithParams(connection: any, statement: string, params: unknown[]): Promise<any[]> {
  if (typeof connection.all === 'function') {
    return await new Promise<any[]>((resolve, reject) => {
      connection.all(statement, params, (error: Error | null, rows: any[]) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(Array.isArray(rows) ? rows : []);
      });
    });
  }

  throw new Error('Current SQLite connection does not support reading parameterized SQL query results');
}

function decodeEmbedding(rawEmbedding: unknown): number[] | null {
  if (Array.isArray(rawEmbedding)) {
    return rawEmbedding;
  }

  if (typeof rawEmbedding === 'string') {
    try {
      const parsed = JSON.parse(rawEmbedding);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  if (Buffer.isBuffer(rawEmbedding)) {
    const floatView = new Float32Array(
      rawEmbedding.buffer,
      rawEmbedding.byteOffset,
      Math.floor(rawEmbedding.byteLength / Float32Array.BYTES_PER_ELEMENT)
    );
    return Array.from(floatView);
  }

  return null;
}

async function ensureVectorExtensionLoaded(sequelize: Sequelize, existingConnection?: any): Promise<void> {
  const loadOnConnection = async (connection: any): Promise<void> => {
    if (connection[VECTOR_EXTENSION_LOADED]) {
      return;
    }

    const sqliteVec = getSqliteVecModule();
    if (!sqliteVec) {
      throw new Error('sqlite-vec dependency is not installed');
    }

    if (typeof sqliteVec.load === 'function') {
      sqliteVec.load(connection);
      connection[VECTOR_EXTENSION_LOADED] = true;
      return;
    }

    const loadablePath =
      typeof sqliteVec.getLoadablePath === 'function'
        ? sqliteVec.getLoadablePath()
        : sqliteVec.path;

    if (!loadablePath) {
      throw new Error('sqlite-vec module does not expose a load helper or loadable path');
    }

    if (typeof connection.loadExtension === 'function') {
      connection.loadExtension(loadablePath);
      connection[VECTOR_EXTENSION_LOADED] = true;
      return;
    }

    if (typeof connection.run === 'function') {
      await runSql(connection, `SELECT load_extension('${loadablePath.replace(/'/g, "''")}')`);
      connection[VECTOR_EXTENSION_LOADED] = true;
      return;
    }

    throw new Error('Current SQLite connection does not support loading extensions');
  };

  if (existingConnection) {
    await loadOnConnection(existingConnection);
    return;
  }

  await withRawConnection(sequelize, async (connection) => {
    await loadOnConnection(connection);
  });
}

async function ensureVectorSchema(sequelize: Sequelize): Promise<void> {
  await withRawConnection(sequelize, async (connection) => {
    await ensureVectorExtensionLoaded(sequelize, connection);

    for (const statement of VECTOR_TABLE_STATEMENTS) {
      await runSql(connection, statement);
    }
  });
}

async function ensureChapterChunkVectorTable(sequelize: Sequelize, existingConnection?: any): Promise<void> {
  const ensureOnConnection = async (connection: any): Promise<void> => {
    await ensureVectorExtensionLoaded(sequelize, connection);
    await runSql(connection, CHAPTER_CHUNK_VECTOR_TABLE_STATEMENT);
  };

  if (existingConnection) {
    await ensureOnConnection(existingConnection);
    return;
  }

  await withRawConnection(sequelize, async (connection) => {
    await ensureOnConnection(connection);
  });
}

async function ensureStoryBibleVectorTable(sequelize: Sequelize, existingConnection?: any): Promise<void> {
  const ensureOnConnection = async (connection: any): Promise<void> => {
    await ensureVectorExtensionLoaded(sequelize, connection);
    await runSql(
      connection,
      `CREATE VIRTUAL TABLE IF NOT EXISTS story_bible_vec USING vec0(entry_id integer, embedding float[${VECTOR_DIMENSION}])`
    );
  };

  if (existingConnection) {
    await ensureOnConnection(existingConnection);
    return;
  }

  await withRawConnection(sequelize, async (connection) => {
    await ensureOnConnection(connection);
  });
}

async function deleteChapterChunkVectors(sequelize: Sequelize, chunkIds: number[]): Promise<void> {
  if (chunkIds.length === 0) {
    return;
  }

  await withRawConnection(sequelize, async (connection) => {
    await ensureChapterChunkVectorTable(sequelize, connection);

    for (const chunkId of chunkIds) {
      await runSqlWithParams(connection, 'DELETE FROM chapter_chunk_vec WHERE chunk_id = ?', [chunkId]);
    }
  });
}

async function insertChapterChunkVectors(
  sequelize: Sequelize,
  rows: Array<{ chunkId: number; embedding: number[] }>
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  await withRawConnection(sequelize, async (connection) => {
    await ensureChapterChunkVectorTable(sequelize, connection);

    for (const row of rows) {
      await runSqlWithParams(
        connection,
        'INSERT INTO chapter_chunk_vec (chunk_id, embedding) VALUES (?, ?)',
        [row.chunkId, JSON.stringify(row.embedding)]
      );
    }
  });
}

async function upsertStoryBibleEntryVector(
  sequelize: Sequelize,
  row: { entryId: number; embedding: number[] }
): Promise<void> {
  await withRawConnection(sequelize, async (connection) => {
    await ensureStoryBibleVectorTable(sequelize, connection);
    const previousRows = await fetchAllWithParams(
      connection,
      'SELECT embedding FROM story_bible_vec WHERE entry_id = ?',
      [row.entryId]
    );
    const previousEmbedding = previousRows[0]?.embedding;

    await runSqlWithParams(connection, 'DELETE FROM story_bible_vec WHERE entry_id = ?', [row.entryId]);

    try {
      await runSqlWithParams(
        connection,
        'INSERT INTO story_bible_vec (entry_id, embedding) VALUES (?, ?)',
        [row.entryId, JSON.stringify(row.embedding)]
      );
    } catch (error) {
      if (previousEmbedding !== undefined) {
        await runSqlWithParams(
          connection,
          'INSERT INTO story_bible_vec (entry_id, embedding) VALUES (?, ?)',
          [row.entryId, previousEmbedding]
        );
      }

      throw error;
    }
  });
}

async function deleteStoryBibleEntryVector(sequelize: Sequelize, entryId: number): Promise<void> {
  await withRawConnection(sequelize, async (connection) => {
    await ensureStoryBibleVectorTable(sequelize, connection);
    await runSqlWithParams(connection, 'DELETE FROM story_bible_vec WHERE entry_id = ?', [entryId]);
  });
}

async function getStoryBibleEntryVector(sequelize: Sequelize, entryId: number): Promise<number[] | null> {
  return await withRawConnection(sequelize, async (connection) => {
    await ensureStoryBibleVectorTable(sequelize, connection);
    const rows = await fetchAllWithParams(
      connection,
      'SELECT embedding FROM story_bible_vec WHERE entry_id = ?',
      [entryId]
    );
    const embedding = rows[0]?.embedding;
    if (embedding === undefined || embedding === null) {
      return null;
    }
    return decodeEmbedding(embedding);
  });
}

async function getStoryBibleEntriesVectors(
  sequelize: Sequelize,
  entryIds: number[]
): Promise<Array<{ entryId: number; embedding: number[] }>> {
  if (entryIds.length === 0) {
    return [];
  }

  return await withRawConnection(sequelize, async (connection) => {
    await ensureStoryBibleVectorTable(sequelize, connection);
    const placeholders = entryIds.map(() => '?').join(', ');
    const rows = await fetchAllWithParams(
      connection,
      `SELECT entry_id, embedding FROM story_bible_vec WHERE entry_id IN (${placeholders})`,
      entryIds
    );

    return rows
      .map((row: any) => {
        const entryId = Number(row.entry_id);
        const embedding = decodeEmbedding(row.embedding);

        if (!Number.isFinite(entryId) || !Array.isArray(embedding)) {
          return null;
        }

        return { entryId, embedding };
      })
      .filter(Boolean) as Array<{ entryId: number; embedding: number[] }>;
  });
}

async function getChapterChunkVectorStats(
  sequelize: Sequelize,
  chunkIds: number[]
): Promise<{ totalRowCount: number; distinctChunkCount: number }> {
  if (chunkIds.length === 0) {
    return {
      totalRowCount: 0,
      distinctChunkCount: 0,
    };
  }

  return await withRawConnection(sequelize, async (connection) => {
    await ensureChapterChunkVectorTable(sequelize, connection);

    const placeholders = chunkIds.map(() => '?').join(', ');
    const rows = await fetchAllWithParams(
      connection,
      `SELECT COUNT(*) AS total_row_count, COUNT(DISTINCT chunk_id) AS distinct_chunk_count FROM chapter_chunk_vec WHERE chunk_id IN (${placeholders})`,
      chunkIds
    );
    const row = rows[0] || {};
    return {
      totalRowCount: Number(row.total_row_count || 0),
      distinctChunkCount: Number(row.distinct_chunk_count || 0),
    };
  });
}

async function getChapterChunkVectors(
  sequelize: Sequelize,
  chunkIds: number[]
): Promise<Array<{ chunkId: number; embedding: number[] }>> {
  if (chunkIds.length === 0) {
    return [];
  }

  return await withRawConnection(sequelize, async (connection) => {
    await ensureChapterChunkVectorTable(sequelize, connection);
    const placeholders = chunkIds.map(() => '?').join(', ');
    const rows = await fetchAllWithParams(
      connection,
      `SELECT chunk_id, embedding FROM chapter_chunk_vec WHERE chunk_id IN (${placeholders})`,
      chunkIds
    );

    return rows
      .map((row: any) => {
        const chunkId = Number(row.chunk_id);
        const embedding = decodeEmbedding(row.embedding);

        if (!Number.isFinite(chunkId) || !Array.isArray(embedding)) {
          return null;
        }

        return { chunkId, embedding };
      })
      .filter(Boolean) as Array<{ chunkId: number; embedding: number[] }>;
  });
}

export {
  deleteStoryBibleEntryVector,
  deleteChapterChunkVectors,
  ensureVectorExtensionLoaded,
  ensureVectorSchema,
  getChapterChunkVectors,
  getStoryBibleEntryVector,
  getStoryBibleEntriesVectors,
  getChapterChunkVectorStats,
  insertChapterChunkVectors,
  upsertStoryBibleEntryVector,
};
