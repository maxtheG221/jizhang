const svg = (body: string, size = 22) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const icons = {
  chevronLeft: svg(`<path d="M14.5 5.5 8 12l6.5 6.5"/>`),
  chevronRight: svg(`<path d="M9.5 5.5 16 12l-6.5 6.5"/>`),
  plus: svg(`<path d="M12 5.5v13M5.5 12h13"/>`, 16),
  ledger: svg(`<path d="M7 4.5h9.2A1.8 1.8 0 0 1 18 6.3v13.2H8.2A1.8 1.8 0 0 1 6.4 17.7V6.3A1.8 1.8 0 0 1 8.2 4.5Z"/><path d="M6.4 8.2H18M9.2 12.1h5.6M9.2 15.2h4"/>`),
  tags: svg(`<path d="M5 7.2h14M5 12h14M5 16.8h14"/><path d="M8 7.2h.01M8 12h.01M8 16.8h.01" stroke-width="2.4"/>`),
  settings: svg(
    `<path d="M4 8h16M4 16h16"/><circle cx="9" cy="8" r="1.7" fill="var(--bg)" stroke="currentColor"/><circle cx="15" cy="16" r="1.7" fill="var(--bg)" stroke="currentColor"/>`,
  ),
};
