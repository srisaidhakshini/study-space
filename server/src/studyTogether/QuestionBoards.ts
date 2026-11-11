import { randomUUID } from 'node:crypto';
import {
  filterProfanity,
  hasQuestionBoard,
  QUESTION_LIMIT,
  STUDY_TOGETHER,
  SUBJECTS,
  type BoardPost,
  type QuestionBoardSnapshot,
} from '@study/shared';
import { addReport } from '../moderation/reports';
import type { PlayerSession } from '../rooms/session';
import { cleanText, isPlainObject } from '../rooms/text';

const QUESTIONS_PER_BOARD = 20;
const ANSWERS_PER_QUESTION = 8;
const WRITE_INTERVAL_MS = 3000;

interface Post {
  id: string;
  authorId: string;
  owner: string;
  author: string;
  text: string;
}

interface Question extends Post {
  answers: Post[];
}

function ownerOf(session: PlayerSession): string {
  return session.userId ? `account:${session.userId}` : `guest:${session.id}`;
}

interface BoardSelection {
  map: string;
  subject: string;
}

function boardKey({ map, subject }: BoardSelection): string {
  return `${map}:${subject}`;
}

/** Each designated map has one board per subject within a room instance. */
export class QuestionBoards {
  private readonly boards = new Map<string, Question[]>();
  private readonly viewers = new WeakMap<PlayerSession, BoardSelection>();
  private readonly lastRead = new WeakMap<PlayerSession, number>();
  private readonly lastWrite = new WeakMap<PlayerSession, number>();

  constructor(
    private readonly sessions: ReadonlyMap<string, PlayerSession>,
    private readonly room: () => { server: string; roomId: string },
  ) {}

  handle(session: PlayerSession, raw: unknown, now: number): void {
    const map = session.player.map;
    if (!isPlainObject(raw)) return;
    if (raw.kind === 'close') {
      this.viewers.delete(session);
      return;
    }
    if (!hasQuestionBoard(map)) return;
    if (raw.kind === 'read') {
      const subject = raw.subject;
      if (typeof subject !== 'string' || !SUBJECTS.some(({ id }) => id === subject)) return;
      const previous = this.viewers.get(session);
      if (previous?.map === map && previous.subject === subject && now - (this.lastRead.get(session) ?? -Infinity) < 1000) return;
      this.viewers.set(session, { map, subject });
      this.lastRead.set(session, now);
      return this.send(session);
    }
    if (raw.kind !== 'ask' && raw.kind !== 'answer' && raw.kind !== 'remove' && raw.kind !== 'report') return;
    const selection = this.viewers.get(session);
    if (selection?.map !== map) return;
    if (session.timer.phase === 'focus') return this.send(session, 'The board is paused while you focus.');
    if (now - (this.lastWrite.get(session) ?? -Infinity) < WRITE_INTERVAL_MS) {
      return this.send(session, 'Wait a few seconds before using the board again.');
    }
    this.lastWrite.set(session, now);

    const key = boardKey(selection);
    const questions = this.boards.get(key) ?? [];
    const owner = ownerOf(session);
    if (raw.kind === 'ask') {
      const post = this.post(session, raw.text);
      if (!post) return this.send(session, 'Enter a question first.');
      questions.unshift({ ...post, answers: [] });
      questions.length = Math.min(questions.length, QUESTIONS_PER_BOARD);
      this.boards.set(key, questions);
    } else {
      const index = questions.findIndex((question) => question.id === raw.questionId && this.visible(session, question));
      const question = questions[index];
      if (!question) return this.send(session, 'That question is no longer available.');
      if (raw.kind === 'answer') {
        if (question.answers.length >= ANSWERS_PER_QUESTION) return this.send(session, 'This question has reached its reply limit.');
        const post = this.post(session, raw.text);
        if (!post) return this.send(session, 'Enter a reply first.');
        question.answers.push(post);
      } else {
        const answerIndex = question.answers.findIndex((answer) => answer.id === raw.answerId && this.visible(session, answer));
        const post = raw.answerId === undefined ? question : question.answers[answerIndex];
        if (!post) return this.send(session, 'That reply is no longer available.');
        if (raw.kind === 'report') {
          if (post.owner === owner) return;
          addReport({
            ...this.room(),
            at: now,
            reporterId: session.id,
            reporterName: session.player.name,
            targetId: post.authorId,
            targetName: post.author,
            reason: `Question board post: ${post.text}`,
          });
          return this.send(session, 'Post reported.');
        }
        if (post.owner !== owner) return;
        if (post === question) questions.splice(index, 1);
        else question.answers.splice(answerIndex, 1);
      }
    }
    for (const viewer of this.sessions.values()) {
      if (viewer.player.map !== map || this.viewers.get(viewer)?.subject !== selection.subject) continue;
      const posted = viewer === session && (raw.kind === 'ask' || raw.kind === 'answer');
      this.send(viewer, undefined, posted);
    }
  }

  send(session: PlayerSession, notice?: string, posted = false): void {
    const map = session.player.map;
    const selection = this.viewers.get(session);
    if (selection?.map !== map) return;
    const owner = ownerOf(session);
    const view = ({ id, authorId, author, text, owner: postOwner }: Post): BoardPost => ({
      id, authorId, author, text, own: postOwner === owner,
    });
    const snapshot: QuestionBoardSnapshot = {
      map,
      subject: selection.subject,
      questions: (this.boards.get(boardKey(selection)) ?? []).filter((question) => this.visible(session, question)).map((question) => ({
        ...view(question),
        answers: question.answers.filter((answer) => this.visible(session, answer)).map(view),
      })),
      ...(notice ? { notice } : {}),
      ...(posted ? { posted: true } : {}),
    };
    session.client.send(STUDY_TOGETHER.board, snapshot);
  }

  private visible(session: PlayerSession, post: Post): boolean {
    return !session.blocked.has(post.authorId) && !this.sessions.get(post.authorId)?.blocked.has(session.id);
  }

  private post(session: PlayerSession, raw: unknown): Post | null {
    const text = cleanText(raw, QUESTION_LIMIT);
    if (!text) return null;
    return {
      id: randomUUID(),
      authorId: session.id,
      owner: ownerOf(session),
      author: session.player.name,
      text: filterProfanity(text).text,
    };
  }
}
