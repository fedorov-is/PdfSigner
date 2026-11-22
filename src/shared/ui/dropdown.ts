import { t } from '../i18n/index.js';
// Keep the select as the source of truth for the existing application events.
export function enhanceDropdowns() {
  for (const select of document.querySelectorAll('select')) {
    const wrapper = document.createElement('div');
    wrapper.className = 'dropdown';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'dropdown-trigger';
    trigger.id = `${select.id}-trigger`;
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const label = document.querySelector<HTMLLabelElement>(
      `label[for="${select.id}"]`,
    );
    if (label) {
      label.htmlFor = trigger.id;
      label.id ||= `${select.id}-label`;
      trigger.setAttribute('aria-labelledby', `${label.id} ${trigger.id}`);
    }
    const menu = document.createElement('div');
    menu.className = 'dropdown-menu';
    menu.id = `${select.id}-menu`;
    menu.popover = 'manual';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', label?.textContent || t('Options'));
    trigger.setAttribute('aria-controls', menu.id);
    select.before(wrapper);
    wrapper.append(select, trigger, menu);
    select.hidden = true;
    let active = -1;
    let search = '';
    let searchedAt = 0;
    const isOpen = () => menu.matches(':popover-open');
    const close = () => {
      menu.hidePopover();
      trigger.setAttribute('aria-expanded', 'false');
      trigger.removeAttribute('aria-activedescendant');
    };
    const highlight = (index: number) => {
      active = index;
      Array.from(menu.children).forEach((option, i) =>
        option.classList.toggle('active', i === index),
      );
      const option = menu.children[index] as HTMLElement | undefined;
      if (option) {
        trigger.setAttribute('aria-activedescendant', option.id);
        if (option.offsetTop < menu.scrollTop)
          menu.scrollTop = option.offsetTop;
        else if (
          option.offsetTop + option.offsetHeight >
          menu.scrollTop + menu.clientHeight
        ) {
          menu.scrollTop =
            option.offsetTop + option.offsetHeight - menu.clientHeight;
        }
      }
    };
    const sync = () => {
      trigger.textContent =
        select.selectedOptions[0]?.textContent || t('Choose an option');
      trigger.disabled = select.disabled;
      menu.replaceChildren(
        ...Array.from(select.options, (option, index) => {
          const item = document.createElement('div');
          item.id = `${select.id}-option-${index}`;
          item.className = 'dropdown-option';
          item.setAttribute('role', 'option');
          item.setAttribute('aria-selected', String(option.selected));
          item.setAttribute('aria-disabled', String(option.disabled));
          item.textContent = option.textContent;
          if (option.selected) {
            const check = document.createElement('span');
            check.className = 'dropdown-check';
            check.setAttribute('aria-hidden', 'true');
            check.textContent = '✓';
            item.append(check);
          }
          item.addEventListener('pointermove', () => {
            if (!option.disabled) highlight(index);
          });
          item.addEventListener('mousedown', (event) => event.preventDefault());
          item.addEventListener('click', () => choose(index));
          return item;
        }),
      );
      if (select.disabled) close();
      else if (isOpen()) highlight(select.selectedIndex);
    };
    const choose = (index: number) => {
      if (
        select.disabled ||
        !select.options[index] ||
        select.options[index].disabled
      )
        return;
      select.selectedIndex = index;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      close();
      trigger.focus();
    };
    const position = () => {
      const rect = trigger.getBoundingClientRect();
      menu.style.width = `${rect.width}px`;
      menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - rect.width - 8))}px`;
      const below = innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const upwards = below < 180 && above > below;
      menu.style.maxHeight = `${Math.max(0, Math.min(280, upwards ? above : below))}px`;
      menu.style.top = upwards ? 'auto' : `${rect.bottom + 4}px`;
      menu.style.bottom = upwards ? `${innerHeight - rect.top + 4}px` : 'auto';
    };
    const open = () => {
      if (trigger.disabled || isOpen()) return;
      position();
      menu.showPopover();
      trigger.setAttribute('aria-expanded', 'true');
      highlight(select.selectedIndex);
    };
    trigger.addEventListener('click', () => {
      if (isOpen()) close();
      else open();
    });
    trigger.addEventListener('keydown', (event) => {
      const options = Array.from(select.options);
      const enabled = options
        .map((option, i) => (option.disabled ? -1 : i))
        .filter((i) => i >= 0);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const wasOpen = isOpen();
        open();
        const position = enabled.indexOf(active);
        const index =
          event.key === 'Home'
            ? enabled[0]
            : event.key === 'End'
              ? enabled.at(-1)
              : !wasOpen
                ? active >= 0
                  ? active
                  : enabled[0]
                : enabled[
                    Math.max(
                      0,
                      Math.min(
                        enabled.length - 1,
                        position + (event.key === 'ArrowDown' ? 1 : -1),
                      ),
                    )
                  ];
        if (index !== undefined) highlight(index);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (isOpen()) choose(active);
        else open();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'Tab') close();
      else if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        search = Date.now() - searchedAt > 700 ? event.key : search + event.key;
        searchedAt = Date.now();
        open();
        const index = enabled.find((i) =>
          options[i].text
            .toLocaleLowerCase()
            .startsWith(search.toLocaleLowerCase()),
        );
        if (index !== undefined) highlight(index);
      }
    });
    document.addEventListener('pointerdown', (event) => {
      if (!wrapper.contains(event.target as Node)) close();
    });
    wrapper.addEventListener('focusout', (event) => {
      if (!wrapper.contains(event.relatedTarget as Node)) close();
    });
    window.addEventListener('resize', close);
    document.addEventListener(
      'scroll',
      (event) => {
        if (event.target !== menu && isOpen()) position();
      },
      true,
    );
    select.addEventListener('change', sync);
    new MutationObserver(sync).observe(select, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    sync();
  }
}
