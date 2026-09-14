import { captureReviewView, restoreReviewCamera } from '../project/review-views.js';

export function installReviewViews({ parent, viewport, assembly, selection, getSettings, setSettings, beforeRestore, refresh, status }) {
  const panel = document.createElement('div');
  panel.className = 'review-views';
  panel.innerHTML = `<strong>Review views</strong>
    <input aria-label="Review view name" placeholder="Name this view" maxlength="80">
    <button data-review="save">Save view</button>
    <select aria-label="Saved review views"></select>
    <button data-review="restore">Recall</button><button data-review="update">Update</button><button data-review="delete">Delete</button>
    <span>Stored when you save the project</span>`;
  parent.append(panel);
  const name = panel.querySelector('input'), list = panel.querySelector('select');
  const render = (selected = list.value) => {
    list.replaceChildren();
    for (const view of assembly.reviewViews || []) list.add(new Option(view.name, view.id));
    if ([...list.options].some(option => option.value === selected)) list.value = selected;
    for (const action of ['restore','update','delete']) panel.querySelector(`[data-review="${action}"]`).disabled = !list.value;
    list.disabled = !list.options.length;
    if (!list.options.length) list.add(new Option('No saved views', ''));
  };
  list.addEventListener('change', () => { name.value = (assembly.reviewViews || []).find(view => view.id === list.value)?.name || ''; });
  panel.addEventListener('click', event => {
    const action = event.target.dataset.review;
    if (!action) return;
    const views = assembly.reviewViews ||= [];
    const index = views.findIndex(view => view.id === list.value);
    if (action === 'save' || action === 'update') {
      if (!assembly.allParts().some(part => part.mesh)) { status('Open a model before saving a review view.'); return; }
      if (action === 'update' && index < 0) return;
      const title = name.value.trim() || (action === 'update' ? views[index].name : `View ${views.length + 1}`);
      const view = captureReviewView(viewport, assembly, getSettings(), title, action === 'update' ? views[index].id : undefined);
      if (action === 'update') views[index] = view; else views.push(view);
      name.value = title; render(view.id); status(`Saved review view "${title}". Save the project to keep it.`);
    } else if (index >= 0 && action === 'restore') {
      const view = views[index];
      beforeRestore(); selection.clear();
      let missing = 0;
      for (const item of view.visibility) {
        const part = assembly.findById(item.id);
        if (part) part.setVisible(item.visible); else missing++;
      }
      setSettings(view.settings);
      restoreReviewCamera(viewport, view.camera);
      refresh(); name.value = view.name;
      status(`Recalled "${view.name}"${missing ? `; ${missing} missing component(s) skipped` : ''}.`);
    } else if (index >= 0 && action === 'delete') {
      const removed = views.splice(index,1)[0];
      render(); name.value = ''; status(`Deleted review view "${removed.name}". Save the project to keep this change.`);
    }
  });
  // Text entry must not trigger the application's single-key modeling shortcuts.
  panel.addEventListener('keydown', event => event.stopPropagation());
  render();
  return { reload() { name.value = ''; render(''); } };
}
