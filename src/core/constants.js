// Vocabulary shared by every screen: statuses, platforms, icons, image URLs.

// Profile colours (index stored in profiles.color). Muted so they sit well on black.
export const AVATAR = ["#C4553F", "#B98A2E", "#2E8A7B", "#4C6FD0", "#7A55C4", "#C2508A", "#6F8B34", "#C96B2C"];
export const STATUSES = [
  { id: "playing", label: "Playing" },
  { id: "want", label: "Want to play" },
  { id: "paused", label: "Paused" },
  { id: "finished", label: "Finished" },
  { id: "dropped", label: "Dropped" },
];
export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]));
export const VERB = {
  want: "wants to play",
  playing: "is playing",
  paused: "paused",
  finished: "finished",
  dropped: "dropped",
};
export const MY_VERB = {
  want: "want to play",
  playing: "are playing",
  paused: "paused",
  finished: "finished",
  dropped: "dropped",
};
export const PLATFORMS = [
  "PC",
  "PS5",
  "PS4",
  "Switch",
  "Switch 2",
  "Xbox Series",
  "Xbox One",
  "Steam Deck",
  "iPhone",
  "Android",
  "Quest",
  "Retro",
];
export const PLAT_FILTERS = [
  { id: "all", label: "All" },
  { id: "pc", label: "PC" },
  { id: "ps", label: "PlayStation" },
  { id: "xbox", label: "Xbox" },
  { id: "switch", label: "Switch" },
];
export const PRECISE_DAY = /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/; // IGDB's "Nov 19, 2026": a real day, not "Q4 2026" or "2027"

export const STAR_PATH =
  "M12 2.6l2.83 6.07 6.65.73-4.95 4.52 1.36 6.55L12 17.2l-5.89 3.27 1.36-6.55-4.95-4.52 6.65-.73z";
export const ICON = {
  feed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h13"/></svg>',
  shelf:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="5" height="16" rx="1"/><rect x="10.5" y="4" width="5" height="16" rx="1"/><path d="M17 5l3.5 1-3.6 14-3.4-1"/></svg>',
  discover:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>',
  friends:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.7-3.6 3.3-5.5 6.5-5.5s5.8 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c1.9.8 3.1 2.6 3.5 5.2"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  share:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
  star: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${"M12 2.6l2.83 6.07 6.65.73-4.95 4.52 1.36 6.55L12 17.2l-5.89 3.27 1.36-6.55-4.95-4.52 6.65-.73z"}" fill="currentColor"/></svg>`,
};
export const SESSION_STEPS = [0.5, 1, 2];
export const IGDB_IMG = (id, size) => `https://images.igdb.com/igdb/image/upload/t_${size}/${id}.jpg`;
export const DAY_MS = 864e5;
