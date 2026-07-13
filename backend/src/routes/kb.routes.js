import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createArticle, deleteArticle, getArticle, listArticles, searchArticles, updateArticle } from '../services/knowledgeService.js';
import { recordAudit } from '../services/auditService.js';
import { kbArticleSchema, kbSearchSchema } from '../validators/schemas.js';

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  res.json(await listArticles(req.auth.tenantId));
}));

router.get('/search', validate(kbSearchSchema, 'query'), asyncHandler(async (req, res) => {
  res.json(await searchArticles(req.auth.tenantId, req.query.q));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await getArticle(req.auth.tenantId, req.params.id));
}));

router.post('/', requireRole('OWNER', 'ADMIN'), validate(kbArticleSchema), asyncHandler(async (req, res) => {
  const article = await createArticle(req.auth.tenantId, req.body);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'KB_ARTICLE_CREATE', entity: 'kb_article', entityId: article.id });
  res.status(201).json(article);
}));

router.put('/:id', requireRole('OWNER', 'ADMIN'), validate(kbArticleSchema), asyncHandler(async (req, res) => {
  const article = await updateArticle(req.auth.tenantId, req.params.id, req.body);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'KB_ARTICLE_UPDATE', entity: 'kb_article', entityId: article.id });
  res.json(article);
}));

router.delete('/:id', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req, res) => {
  await deleteArticle(req.auth.tenantId, req.params.id);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'KB_ARTICLE_DELETE', entity: 'kb_article', entityId: req.params.id });
  res.status(204).send();
}));

export default router;
