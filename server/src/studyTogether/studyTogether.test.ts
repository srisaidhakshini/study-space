import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Client } from '@colyseus/core';
import { buddySeat, startTimer, STUDY_TOGETHER, treeStage, type QuestionBoardSnapshot } from '@study/shared';
import { PlayerSession } from '../rooms/session';
import { Player } from '../schema/PlayerState';
import { getWorld } from '../world/maps';
import { QuestionBoards } from './QuestionBoards';
import { SharedTree } from './tree';

test('shared tree saves only whole minutes and restores its stage on restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'study-tree-'));
  try {
    const path = join(directory, 'tree.json');
    const tree = new SharedTree(path);
    assert.equal(tree.minutes, 0);
    assert.equal(tree.add(0), false);
    assert.equal(tree.add(1.5), false);
    assert.equal(tree.add(59), true);
    assert.equal(treeStage(tree.minutes), 0);
    assert.equal(tree.add(1), true);
    const restored = new SharedTree(path);
    assert.equal(restored.minutes, 60);
    assert.equal(treeStage(restored.minutes), 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('each generated library seat has one reciprocal buddy seat', () => {
  const library = getWorld().maps.get('library');
  assert.ok(library);
  const seats = [...library.seats.values()];
  assert.ok(seats.length > 0);
  for (const seat of seats) {
    const partner = buddySeat(seats, seat);
    assert.ok(partner, seat.id);
    assert.equal(Math.abs(partner.tx - seat.tx), 1);
    assert.equal(buddySeat(seats, partner), seat);
  }
});

function participant(id: string, map: string) {
  const messages: QuestionBoardSnapshot[] = [];
  const client = {
    sessionId: id,
    send(type: string, snapshot: QuestionBoardSnapshot) {
      assert.equal(type, STUDY_TOGETHER.board);
      messages.push(snapshot);
    },
  } as Client;
  const player = new Player();
  player.name = id;
  player.map = map;
  return { session: new PlayerSession(client, player), messages };
}

test('question boards isolate maps, enforce ownership and focus, and filter blocks', () => {
  const a = participant('Alice', 'library');
  const b = participant('Ben', 'library');
  const c = participant('Charlie', 'cafe');
  const boards = new QuestionBoards(new Map([a, b, c].map(({ session }) => [session.id, session])), () => ({
    server: 'Maple', roomId: 'test',
  }));
  for (const p of [a, b, c]) boards.handle(p.session, { kind: 'read' }, 0);
  boards.handle(a.session, { kind: 'ask', text: '  How\n do I start? ' }, 1);
  const question = b.messages.at(-1)?.questions[0];
  assert.ok(question);
  assert.equal(question.text, 'How do I start?');
  assert.equal(question.own, false);
  assert.equal(a.messages.at(-1)?.posted, true);
  assert.equal(c.messages.length, 1);
  assert.equal(c.messages[0].questions.length, 0);

  boards.handle(b.session, { kind: 'answer', questionId: question.id, text: 'Start with the first example.' }, 2);
  assert.equal(a.messages.at(-1)?.questions[0].answers.length, 1);
  boards.handle(b.session, { kind: 'remove', questionId: question.id }, 4_000);
  boards.send(b.session);
  assert.equal(b.messages.at(-1)?.questions.length, 1);

  b.session.timer = startTimer({ mode: 'stopwatch', focusMin: 25, breakMin: 5, autoRepeat: false, subject: 'general' }, 5_000);
  boards.handle(b.session, { kind: 'ask', text: 'Posted during focus' }, 9_000);
  assert.match(b.messages.at(-1)?.notice ?? '', /focus/);

  a.session.blocked.add(b.session.id);
  boards.send(b.session);
  assert.equal(b.messages.at(-1)?.questions.length, 0);
  boards.send(a.session);
  assert.equal(a.messages.at(-1)?.questions[0].answers.length, 0);
  boards.handle(b.session, { kind: 'close' }, 9_001);
  boards.handle(a.session, { kind: 'remove', questionId: question.id }, 9_002);
  assert.equal(a.messages.at(-1)?.questions.length, 0);
});
