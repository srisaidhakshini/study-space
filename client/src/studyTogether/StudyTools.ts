import {
  hasQuestionBoard,
  QUESTION_LIMIT,
  TREE_STAGES,
  treeStage,
  type BoardPost,
  type BoardQuestion,
} from '@study/shared';
import { app } from '../app';
import { bus } from '../bus';
import { button, h } from '../ui/dom';
import { openModal } from '../ui/modal';
import { focusGhostEnabled, setFocusGhost, studyDeskStatus } from './preferences';
import './studyTools.css';

export function createStudyTools(root: HTMLElement): HTMLElement {
  let map = '';
  let closePanel: (() => void) | null = null;
  const study = button('Study together', 'btn btn-small', () => open());
  study.hidden = true;
  const desk = h('span', { class: 'chip study-desk-status', attrs: { hidden: true } });
  studyDeskStatus.subscribe((status) => {
    desk.hidden = !status;
    desk.textContent = status;
  });

  const updateVisibility = (): void => {
    study.hidden = map !== 'garden' && map !== 'library' && !(app.net.online && hasQuestionBoard(map));
  };
  bus.on('location', ({ mapId }) => {
    if (mapId !== map) closePanel?.();
    map = mapId;
    updateVisibility();
  });
  app.net.changed.subscribe(updateVisibility);

  function open(): void {
    if (closePanel) return;
    const title = h('h2', { attrs: { id: 'study-together-title' } }, 'Study together');
    const panel = h('section', {
      class: 'panel study-together',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': title.id },
    }, h('div', { class: 'panel-head' }, title, button('Close', 'btn btn-small', close)));
    const openedMap = map;
    const off: (() => void)[] = [];
    const modal = openModal(root, panel, close);
    closePanel = close;

    function close(): void {
      off.forEach((unsubscribe) => unsubscribe());
      modal.close();
      closePanel = null;
      if (!study.hidden) study.focus();
    }

    if (openedMap === 'garden') {
      const tree = h('section', { class: 'study-section' });
      const render = (): void => renderTree(tree);
      off.push(app.net.treeChanged.subscribe(render), app.net.changed.subscribe(render));
      render();
      panel.append(tree);
    }
    if (openedMap === 'library') panel.append(libraryTools());
    if (app.net.online && hasQuestionBoard(openedMap)) {
      off.push(() => app.net.sendBoardAction({ kind: 'close' }));
      panel.append(questionBoard(openedMap, off));
      off.push(app.net.changed.subscribe(() => {
        if (!app.net.online) close();
      }));
    }
    panel.querySelector('button')?.focus();
  }

  return h('div', { class: 'study-tools' }, study, desk);
}

function renderTree(section: HTMLElement): void {
  const minutes = app.net.treeMinutes;
  const stage = treeStage(minutes);
  const next = TREE_STAGES[stage + 1];
  const title = h('h3', {}, 'Shared tree');
  if (!app.net.online) {
    section.replaceChildren(title, h('p', {}, 'Join a server to see the shared tree and add focus minutes.'));
    return;
  }
  section.replaceChildren(
    title,
    h('p', {}, `${TREE_STAGES[stage].label} · ${minutes.toLocaleString()} community focus minutes`),
    next
      ? h('progress', { attrs: { value: minutes, max: next.minutes, 'aria-label': 'Shared tree growth' } })
      : h('p', {}, 'The tree is in full bloom.'),
    next ? h('p', {}, `${(next.minutes - minutes).toLocaleString()} minutes until ${next.label.toLowerCase()}.`) : h('span'),
    h('p', {}, 'Finish a focus session at any Garden seat to help the tree grow.'),
  );
}

function libraryTools(): HTMLElement {
  const ghost = h('input', { attrs: { type: 'checkbox', checked: focusGhostEnabled() } });
  ghost.addEventListener('change', () => setFocusGhost(ghost.checked));
  return h('section', { class: 'study-section' },
    h('h3', {}, 'Buddy desks'),
    h('p', {}, 'Sit at either seat beside a blue desk marker. If someone takes the paired seat, you can see when they are focusing or on break. Each person runs their own timer.'),
    h('label', { class: 'study-ghost-toggle' }, ghost, 'Show my focus ghost at empty buddy seats'),
    h('p', {}, 'The ghost uses the length of your latest focus session on this device. Only you can see it, and it steps aside when someone takes the seat.'),
  );
}

function questionBoard(map: string, off: (() => void)[]): HTMLElement {
  const list = h('div', { class: 'study-questions' }, h('p', {}, 'Loading questions…'));
  const status = h('p', { class: 'study-board-status', attrs: { role: 'status' } });
  const input = h('textarea', { class: 'input', attrs: { maxlength: QUESTION_LIMIT, rows: 2, required: true, id: 'study-board-input' } });
  const label = h('label', { attrs: { for: input.id } }, 'Ask a question');
  const submit = h('button', { class: 'btn btn-small', attrs: { type: 'submit' } }, 'Post question');
  let replyTo: BoardQuestion | null = null;
  let questions: BoardQuestion[] = [];
  let pendingText: string | null = null;

  const choose = (question: BoardQuestion | null): void => {
    replyTo = question;
    label.textContent = question ? `Reply to ${question.author}` : 'Ask a question';
    submit.textContent = question ? 'Post reply' : 'Post question';
    cancelReply.hidden = !question;
  };
  const cancelReply = button('Cancel reply', 'btn btn-small', () => choose(null));
  cancelReply.hidden = true;
  const form = h('form', {
    class: 'study-board-form',
    on: { submit: (event) => {
      event.preventDefault();
      if (!input.value.trim()) return;
      if (pendingText !== null) return;
      pendingText = input.value;
      app.net.sendBoardAction(replyTo
        ? { kind: 'answer', questionId: replyTo.id, text: input.value }
        : { kind: 'ask', text: input.value });
    } },
  }, label, input, h('div', { class: 'row' }, submit, cancelReply));

  const readOnly = (): void => {
    const focusing = app.timer.state.phase === 'focus';
    input.disabled = focusing;
    submit.disabled = focusing;
    status.textContent = focusing ? 'Posting is paused while you focus.' : '';
  };
  const render = (): void => {
    const hidden = new Set(app.net.players().filter((player) => player.muted || player.blocked).map((player) => player.id));
    const visible = questions.filter((question) => !hidden.has(question.authorId));
    list.replaceChildren(...visible.map((question) => {
      const reply = button('Reply', 'btn btn-small', () => {
        choose(question);
        input.focus();
      });
      return h('article', { class: 'study-question' },
        h('div', { class: 'study-post' }, h('strong', {}, question.author), h('p', {}, question.text)),
        h('div', { class: 'row' }, reply, postAction(question, question)),
        ...question.answers.filter((answer) => !hidden.has(answer.authorId)).map((answer) =>
          h('div', { class: 'study-answer study-post' },
            h('strong', {}, answer.author), h('p', {}, answer.text), postAction(question, answer))),
      );
    }));
    if (visible.length === 0) list.append(h('p', {}, 'No questions yet.'));
    if (replyTo && !visible.some((question) => question.id === replyTo?.id)) choose(null);
  };
  off.push(
    app.net.questionBoard.subscribe((snapshot) => {
      if (snapshot.map !== map) return;
      questions = snapshot.questions;
      if (snapshot.posted) {
        if (input.value === pendingText) input.value = '';
        pendingText = null;
        choose(null);
      }
      readOnly();
      if (snapshot.notice) {
        pendingText = null;
        status.textContent = snapshot.notice;
      }
      render();
    }),
    app.timer.changed.subscribe(readOnly),
    app.net.changed.subscribe(() => {
      if (app.net.online) render();
    }),
  );
  readOnly();
  app.net.sendBoardAction({ kind: 'read' });
  return h('section', { class: 'study-section' }, h('h3', {}, 'Question board'), list, form, status);
}

function postAction(question: BoardQuestion, post: BoardPost): HTMLButtonElement {
  const label = post.own ? 'Remove' : 'Report';
  return button(label, 'btn btn-small', () => {
    app.net.sendBoardAction({
      kind: post.own ? 'remove' : 'report',
      questionId: question.id,
      ...(post.id === question.id ? {} : { answerId: post.id }),
    });
  }, { 'aria-label': `${label} ${post.author}’s ${post.id === question.id ? 'question' : 'reply'}` });
}
