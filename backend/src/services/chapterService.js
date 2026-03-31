const db = require('../config/database');
const aiService = require('./aiService');
const reviewAgent = require('./reviewAgent');

function create(data) {
  const stmt = db.prepare(`
    INSERT INTO chapters (novel_id, architecture_id, chapter_number, title, content, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    data.novelId,
    data.architectureId || null,
    data.chapterNumber,
    data.title || null,
    data.content || null,
    data.status || 'draft'
  );
  return findById(result.lastInsertRowid);
}

function findByNovelId(novelId) {
  const stmt = db.prepare('SELECT * FROM chapters WHERE novel_id = ? ORDER BY chapter_number');
  return stmt.all(novelId);
}

function findById(id) {
  const stmt = db.prepare('SELECT * FROM chapters WHERE id = ?');
  return stmt.get(id);
}

function update(id, data) {
  const chapter = findById(id);
  if (!chapter) return null;

  if (data.content && data.content !== chapter.content) {
    createVersion(id, chapter.content);
  }

  const stmt = db.prepare(`
    UPDATE chapters 
    SET title = COALESCE(?, title),
        content = COALESCE(?, content),
        status = COALESCE(?, status),
        architecture_id = COALESCE(?, architecture_id),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(data.title, data.content, data.status, data.architectureId, id);
  return findById(id);
}

function deleteChapter(id) {
  const chapter = findById(id);
  if (!chapter) return false;

  const stmt = db.prepare('DELETE FROM chapters WHERE id = ?');
  stmt.run(id);
  return true;
}

function createVersion(chapterId, content) {
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM chapter_versions WHERE chapter_id = ?');
  const { count } = countStmt.get(chapterId);

  const stmt = db.prepare(`
    INSERT INTO chapter_versions (chapter_id, version_number, content)
    VALUES (?, ?, ?)
  `);
  stmt.run(chapterId, count + 1, content);
}

function getVersions(chapterId) {
  const stmt = db.prepare('SELECT * FROM chapter_versions WHERE chapter_id = ? ORDER BY version_number DESC');
  return stmt.all(chapterId);
}

function restoreVersion(chapterId, versionNumber) {
  const versionStmt = db.prepare('SELECT content FROM chapter_versions WHERE chapter_id = ? AND version_number = ?');
  const version = versionStmt.get(chapterId, versionNumber);
  if (!version) return null;

  return update(chapterId, { content: version.content });
}

async function generate(chapterId, templateId) {
  const chapter = findById(chapterId);
  if (!chapter) throw new Error('章节不存在');

  const novelStmt = db.prepare('SELECT * FROM novels WHERE id = ?');
  const novel = novelStmt.get(chapter.novel_id);

  const archStmt = db.prepare('SELECT * FROM architectures WHERE id = ?');
  const architecture = chapter.architecture_id ? archStmt.get(chapter.architecture_id) : null;

  const generatedContent = await aiService.generateChapter({
    novel,
    chapter,
    architecture,
    templateId
  });

  const updatedChapter = update(chapterId, {
    content: generatedContent,
    status: 'generated'
  });

  const reviewResult = await reviewAgent.review({
    chapter: updatedChapter,
    novel,
    architecture
  });

  return {
    chapter: updatedChapter,
    review: reviewResult
  };
}

module.exports = {
  create,
  findByNovelId,
  findById,
  update,
  delete: deleteChapter,
  getVersions,
  restoreVersion,
  generate
};
