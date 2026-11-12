import { TREE_STAGES, treeStage } from '@study/shared';
import { app } from '../app';
import { h } from '../ui/dom';
import './homeBuddyTrees.css';

export function homeBuddyTrees(cleanup: (() => void)[]): HTMLElement {
  const select = h('select', { class: 'input', attrs: { id: 'home-buddy-tree' } });
  const picker = h('div', { class: 'row wrap' }, h('label', { attrs: { for: select.id } }, 'Tree shared with'), select);
  const details = h('div', { class: 'home-buddy-tree-details' });
  const art = h('div', { class: 'home-buddy-tree-art' });
  const path = app.manifest.images.buddy_tree;
  const image = path ? h('img', { attrs: { src: 'assets/' + path, alt: '', width: 96, height: 96 } }) : null;
  if (image) art.append(image);
  const preview = h('div', { class: 'home-buddy-tree-preview' }, art, details);
  const empty = h('p', {}, 'Add a friend from People or Friends to start a buddy tree.');
  let selectedId = '';
  let options = '';

  function render(): void {
    const trees = app.net.buddies.links.filter((link) => link.status === 'accepted');
    const tree = trees.find((link) => link.id === selectedId) ?? trees[0];
    picker.hidden = trees.length < 2;
    preview.hidden = !tree;
    empty.hidden = !!tree;
    if (!tree) {
      details.replaceChildren();
      return;
    }
    selectedId = tree.id;
    const nextOptions = JSON.stringify(trees.map(({ id, name }) => [id, name]));
    if (nextOptions !== options) {
      options = nextOptions;
      select.replaceChildren(...trees.map(({ id, name }) => h('option', { attrs: { value: id } }, name)));
    }
    select.value = selectedId;
    const index = treeStage(tree.focusMinutes);
    const stage = TREE_STAGES[index];
    const next = TREE_STAGES[index + 1];
    if (image) image.style.width = `${stage.scale * 100}%`;
    details.replaceChildren(
      h('h3', {}, `Tree with ${tree.name}`),
      h('p', {}, `${stage.label} · ${tree.focusMinutes.toLocaleString()} minutes together`),
      ...(next ? [
        h('progress', { attrs: { value: tree.focusMinutes, max: next.minutes, 'aria-label': 'Buddy tree growth' } }),
        h('p', {}, `${(next.minutes - tree.focusMinutes).toLocaleString()} more minutes to ${next.label.toLowerCase()}.`),
      ] : [h('p', {}, 'Your tree is in full bloom.')]),
    );
  }

  select.addEventListener('change', () => {
    selectedId = select.value;
    render();
  });
  cleanup.push(app.net.buddiesChanged.subscribe(render));
  render();
  return h('section', { class: 'study-section' }, picker, preview, empty);
}
