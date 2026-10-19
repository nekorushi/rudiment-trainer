// Slide-in drawer with a scrim. Generic, so the rudiment list, routines and
// practice log can each have one.

/**
 * @param {object} o
 * @param {HTMLElement} o.drawer
 * @param {HTMLElement} o.scrim    tapping it closes the drawer
 * @param {HTMLElement} o.opener   button that opens it (gets aria-expanded)
 * @param {HTMLElement} [o.closer] button inside the drawer that closes it
 * @param {() => void} [o.onOpen]  e.g. close the other drawers
 * @param {() => void} [o.onClose]
 */
export function createDrawer({ drawer, scrim, opener, closer, onOpen, onClose }) {
  let isOpen = false;

  function setOpen(open) {
    if (open) onOpen?.();
    else onClose?.();
    isOpen = open;
    drawer.classList.toggle('open', open);
    drawer.toggleAttribute('inert', !open);
    drawer.setAttribute('aria-hidden', String(!open));
    scrim.classList.toggle('open', open);
    opener.setAttribute('aria-expanded', String(open));
  }

  const open = () => setOpen(true);
  const close = () => { if (isOpen) setOpen(false); };
  opener.addEventListener('click', open);
  closer?.addEventListener('click', close);
  scrim.addEventListener('click', close);

  return { open, close, get isOpen() { return isOpen; } };
}
