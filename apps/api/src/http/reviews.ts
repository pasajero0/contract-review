import { ErrorBody } from '@lex-poc/contract/errors';
import { DocumentResponse, DocumentsResponse, getDocument, getDocuments } from '@lex-poc/contract/documents';
import { getLawyers, LawyersResponse } from '@lex-poc/contract/lawyers';
import { getQuota, QuotaResponse } from '@lex-poc/contract/quota';
import { getReview, RequestReviewResponse, requestReview, ReviewResponse } from '@lex-poc/contract/reviews';
import type { FastifyInstance } from 'fastify';
import type { RequestRejection, ReviewService } from '../services/reviewService.ts';

const STATUS_BY_CODE: Record<RequestRejection['code'], number> = {
  lawyer_not_found: 400,
  document_not_found: 404,
  document_superseded: 409,
  review_in_progress: 409,
  plan_exhausted: 409,
};

function toErrorBody(rejection: RequestRejection): ErrorBody {
  switch (rejection.code) {
    case 'document_not_found':
      return { code: 'document_not_found' };
    case 'lawyer_not_found':
      return { code: 'lawyer_not_found' };
    case 'document_superseded':
      return { code: 'document_superseded', currentVersionId: rejection.currentVersionId };
    case 'review_in_progress':
      return { code: 'review_in_progress', startedBy: rejection.startedBy, startedAt: rejection.startedAt };
    case 'plan_exhausted':
      return { code: 'plan_exhausted', resetsAt: rejection.resetsAt };
  }
}

export function registerReviewRoutes(app: FastifyInstance, service: ReviewService): void {
  app.route<{ Params: { id: string } }>({
    method: requestReview.method,
    url: requestReview.path,
    handler: async (request, reply) => {
      const lawyerId = request.headers['x-lawyer-id'];
      if (typeof lawyerId !== 'string' || lawyerId === '') {
        const body: ErrorBody = { code: 'lawyer_required' };
        return reply.code(400).send(body);
      }

      const result = service.requestReview(request.params.id, lawyerId);
      if (!result.ok) {
        return reply.code(STATUS_BY_CODE[result.code]).send(ErrorBody.parse(toErrorBody(result)));
      }

      const body: RequestReviewResponse = { reviewId: result.review.reviewId };
      return reply.code(201).send(RequestReviewResponse.parse(body));
    },
  });

  app.route<{ Params: { id: string } }>({
    method: getReview.method,
    url: getReview.path,
    handler: async (request, reply) => {
      const review = service.getReview(request.params.id);
      if (!review) {
        const body: ErrorBody = { code: 'review_not_found' };
        return reply.code(404).send(body);
      }

      const body: ReviewResponse = review;
      return reply.send(ReviewResponse.parse(body));
    },
  });

  app.route<{ Params: { id: string } }>({
    method: getDocument.method,
    url: getDocument.path,
    handler: async (request, reply) => {
      const document = service.getDocument(request.params.id);
      if (!document) {
        const body: ErrorBody = { code: 'document_not_found' };
        return reply.code(404).send(body);
      }

      const body: DocumentResponse = document;
      return reply.send(DocumentResponse.parse(body));
    },
  });

  app.route({
    method: getLawyers.method,
    url: getLawyers.path,
    handler: async (_request, reply) => {
      const body: LawyersResponse = { lawyers: service.listLawyers() };
      return reply.send(LawyersResponse.parse(body));
    },
  });

  app.route({
    method: getQuota.method,
    url: getQuota.path,
    handler: async (_request, reply) => {
      const body: QuotaResponse = service.getQuota();
      return reply.send(QuotaResponse.parse(body));
    },
  });

  app.route({
    method: getDocuments.method,
    url: getDocuments.path,
    handler: async (_request, reply) => {
      const body: DocumentsResponse = service.listDocuments();
      return reply.send(DocumentsResponse.parse(body));
    },
  });
}
