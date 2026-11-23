# Kalamalah Player — 400 Feature Ideas & Roadmap Concepts

A comprehensive brainstorm of **400 features and ideas** tailored for **Kalamalah Player** (Hybrid SSR + Static Export Quran Player & Reader with Mushaf Pages, Word-by-Word Ayah Sync, GSAP Motion, and PreMiD integration).

---

## 1. Audio Playback & Reciter Engine (1–25)
1. **Gapless Ayah-to-Ayah Playback**: Pre-buffer the next Ayah's audio segment before the current one ends for zero-gap transitions.
2. **Variable Playback Speed**: Fine-grained speed control (`0.5x` to `2.0x` in `0.05x` increments) with pitch preservation.
3. **Ayah Loop / Repeat Mode**: Repeat a single Ayah `N` times or infinitely.
4. **Range Loop (A-B Repeat)**: Select a start Ayah and end Ayah to loop continuously for memorization.
5. **Surah Loop & Auto-Advance**: Toggle between stopping at Surah end, looping the Surah, or advancing to the next Surah.
6. **Juz / Hizb / Rub' Playback**: Play an entire Juz, Hizb, or Rub' al-Hizb as a continuous queue.
7. **Reciter Comparison Mode**: Switch reciters mid-Surah while keeping the exact Ayah position.
8. **Side-by-Side Reciter A/B**: Play two reciters alternatingly per Ayah (e.g., teacher + student style).
9. **Pause-After-Ayah (Echo Mode)**: Automatically pause for `X` seconds (or `1x` Ayah duration) after each Ayah so the listener can repeat aloud.
10. **Sleep Timer**: Fade out audio smoothly after `15m`, `30m`, `60m`, or at the end of the current Surah/Juz.
11. **Smart Fade-In / Fade-Out**: Smooth volume ramping on play, pause, seek, and sleep timer end.
12. **Silence Trimming**: Optionally skip long silences between Ayahs for faster listening.
13. **Crossfade Between Surahs**: Gentle crossfade when transitioning from one Surah to the next.
14. **Reciter Favorites & Pinning**: Pin favorite reciters to the top of the selector.
15. **Reciter Filtering**: Filter reciters by Qira'at/Riwayah (Hafs, Warsh, Qalun, etc.), style (Murattal, Mujawwad), or country.
16. **Audio Quality Selector**: Switch between 64kbps (data saver), 128kbps, and 192/320kbps streams.
17. **Audio Equalizer (EQ)**: Built-in Web Audio API presets (Voice Clarity, Warmth, Bass Boost, Treble, Custom 5-band).
18. **Volume Normalization (LUFS)**: Normalize volume across different reciters so switching doesn't cause sudden loudness jumps.
19. **Background Ambient Soundscapes**: Optional subtle rain/nature/masjid ambience mixed underneath recitation.
20. **Car / Driving Mode**: Simplified large-button audio player with voice/gesture-friendly controls.
21. **Mini Floating Player**: Persistent draggable/dockable mini-player when browsing other pages.
22. **Waveform & Scrubbing Preview**: Interactive audio waveform showing Ayah boundaries along the timeline.
23. **Resume Last Position**: Automatically remember and offer to resume the exact Ayah, timestamp, and reciter.
24. **Queue / Playlist Builder**: Create custom playlists of Surahs or specific Ayah ranges (e.g., "Morning Adhkar Surahs", "Friday Kahf").
25. **Auto-Play Bismillah Toggle**: Option to include or skip Bismillah when starting a Surah.

---

## 2. Word-by-Word Sync & Tajweed (26–50)
26. **Precision Word-by-Word Highlighting**: Highlight each Arabic word in real time as the reciter pronounces it.
27. **Karaoke-Style Smooth Fill**: Animate word highlight progress smoothly across the word's duration using GSAP/CSS.
28. **Click-a-Word to Seek**: Clicking any word in an Ayah jumps audio playback directly to that word's timestamp.
29. **Word Hover Tooltip**: Hovering over a word shows its transliteration, root letters, and literal English/user-language meaning.
30. **Word-by-Word Audio Isolation**: Click-and-hold (or double-click) a word to hear only that word repeated.
31. **Color-Coded Tajweed Rules**: Toggleable Tajweed color highlighting (Ghunnah, Qalqalah, Idgham, Ikhfa, Madd, etc.).
32. **Interactive Tajweed Legend**: Clicking a colored Tajweed segment opens a concise rule explanation + audio example.
33. **Tajweed Rule Filter**: Highlight only specific Tajweed rules (e.g., only Madd or only Qalqalah) for focused practice.
34. **Waqf (Stop Sign) Indicators**: Interactive tooltips on stop marks (`مـ`, `لا`, `ج`, `صلے`, `قلے`) explaining whether to stop or continue.
35. **Sajdah (Prostration) Alerts**: Visual badge and optional gentle chime when reaching an Ayah of Sajdah.
36. **Muqatta'at (Disjoined Letters) Info**: Special badge/tooltip on opening letters like `الم`, `يس`, `حم`.
37. **Offset Calibration Tool**: Built-in UI to fine-tune word/Ayah sync offsets (`offsets.json`) per reciter if drift occurs.
38. **Auto-Scroll Follow Mode**: Smoothly keep the currently recited Ayah/word centered in the viewport.
39. **Smart Auto-Scroll Pause**: Temporarily pause auto-scroll if the user manually scrolls away, with a "Return to Active Ayah" pill.
40. **Dim Non-Active Ayahs**: Focus mode that dims surrounding Ayahs so only the active Ayah is full contrast.
41. **Word Root & Morphology Drawer**: Clicking a word opens a side drawer with its 3-letter Arabic root, verb form, and other occurrences in the Quran.
42. **Transliteration Toggle**: Show/hide word-by-word or full-Ayah transliteration.
43. **Transliteration Style**: Choose between Academic/ISO and Simplified phonetic transliteration.
44. **Ayah Number Ornament Styles**: Switch between traditional Madani rosette, minimal circle, or bracketed Ayah numbers.
45. **Verse-End Pause Indicator**: Visual pulse at the end of an Ayah during recitation.
46. **Multi-Word Phrase Grouping**: Highlight common Quranic phrases/idioms together when studying.
47. ** Tajweed Practice Recorder**: Record your own voice reciting an Ayah and play it back alongside the reciter.
48. **Pitch/Timing Visual Comparison**: Overlay user's recorded waveform against the reciter's waveform.
49. **Makharij (Articulation Points) Guide**: Quick-reference modal showing tongue/throat diagrams for Arabic letters.
50. **Sync Export**: Export word-level timing JSON/LRC/SRT files for external video/subtitle creators.

---

## 3. Mushaf & Reading Experience (51–75)
51. **Authentic 15-Line Madani Mushaf View**: True page-by-page layout matching the King Fahd Complex Mushaf.
52. **13-Line Indo-Pak Mushaf View**: Support for South Asian Nastaliq/Indo-Pak script and pagination.
53. **Uthmani vs. Simple (Imlaei) Script**: Toggle between Uthmani calligraphy and modern standard Arabic script.
54. **Two-Page Spread (Book Mode)**: Desktop wide-screen view showing two Mushaf pages side by side (right-to-left).
55. **Realistic Page-Turn Animation**: Smooth GSAP-powered RTL page-flip or slide transition.
56. **Continuous Scroll View**: Vertical infinite-scroll reading mode for Surahs or Juz.
57. **Ayah-by-Ayah Card View**: Clean card layout showing Arabic, translation, and tafsir stacked per Ayah.
58. **Font Family Selector**: Choose from KFGQPC Hafs, Amiri Quran, Scheherazade New, Noto Naskh Arabic, Me Quran, etc.
59. **Dynamic Font Size & Line Height**: Independent sliders for Arabic text size, translation size, and line spacing.
60. **Page Margin & Border Ornaments**: Toggleable traditional illuminated Mushaf borders or clean borderless reading.
61. **Juz / Hizb / Manzil Sidebars**: Margin markers showing Juz, Hizb, half, and quarter-Hizb boundaries.
62. **Quick Page Jump**: Type a page number (`1–604`) to jump instantly.
63. **Surah Header Banners**: Traditional ornamental Surah headers with revelation place (Makki/Madani) and Ayah count.
64. **Bismillah Calligraphy Variants**: Switch between different calligraphic Bismillah styles.
65. **Full-Screen Distraction-Free Mode**: Hide all chrome, toolbars, and sidebars for pure reading.
66. **Auto-Hide Controls on Idle**: Fade out UI controls after 3 seconds of inactivity during reading/listening.
67. **Paper Texture Background**: Optional subtle warm parchment/paper grain texture for eye comfort.
68. **Blue-Light / Sepia Night Filter**: Warm amber tint for late-night reading.
69. **Pinch-to-Zoom on Mushaf**: Smooth zoom on mobile/touchscreens for Mushaf pages.
70. **Reading Ruler / Line Guide**: Optional horizontal highlight bar to help track lines on dense Mushaf pages.
71. **Last-Read Ribbon Bookmark**: Visual red/gold ribbon on the Mushaf page where the user last stopped.
72. **Print-Friendly Mushaf / Surah Export**: Clean `@media print` stylesheet for printing Surahs or study sheets.
73. **Side-by-Side Translation & Mushaf**: Split screen with Mushaf on the right and synced translations on the left.
74. **Surah Overview Card**: Brief summary, themes, and virtues at the top of each Surah.
75. **Revelation Order Navigation**: Option to browse Surahs in chronological revelation order instead of Mushaf order.

---

## 4. Memorization (Hifz) & Revision Tools (76–100)
76. **Blur / Hide Ayah Text Mode**: Hide Arabic text (reveal on tap/hover) to test memorization.
77. **Progressive Word Masking**: Hide every 2nd word, random words, or only show the first word of each Ayah.
78. **First-Letter Hint Mode**: Show only the first letter of each word as a memory cue.
79. **Mistake Counter**: Tap words you stumbled on during recitation to log weak spots.
80. **Weak Ayah Heatmap**: Visual highlight on Mushaf/Surah list showing which Ayahs need more review.
81. **Spaced Repetition (SRS) Scheduler**: Anki-style review queue for memorized Surahs/pages based on recall confidence.
82. **Hifz Progress Tracker**: Track percentage memorized per Surah, Juz, and overall Quran (6,236 Ayahs / 604 Pages).
83. **Mutashabihat (Similar Verses) Highlighter**: Flag Ayahs that closely resemble other Ayahs in the Quran to prevent confusion.
84. **Mutashabihat Side-by-Side**: Compare similar Ayahs directly in a modal with differences highlighted.
85. **Ayah-by-Ayah Accumulative Loop**: Play Ayah 1, then 1–2, then 1–3, etc. (classic Hifz method).
86. **Page-by-Page Hifz Mode**: Loop an entire Mushaf page `N` times.
87. **Random Ayah Quiz**: Play or show a random Ayah from your memorized pool and ask you to continue the next Ayah.
88. **Surah Ending / Beginning Drill**: Practice transitions between Surahs or pages.
89. **Daily Hifz & Muraja'ah (Revision) Split**: Separate daily targets for *new* memorization vs. *revision*.
90. **Teacher/Peer Checkoff**: Export a shareable Hifz progress link or PDF report for a teacher.
91. **Audio-Only Blind Test**: Recite along with muted audio, then unmute to check accuracy.
92. **Ayah Count & Page Boundary Alerts**: Subtle indicator when approaching the bottom of a Mushaf page.
93. **Custom Hifz Notes**: Attach personal mnemonic notes to tricky Ayahs.
94. **Juz Amma / Juz Tabarak Quick-Start**: Dedicated preset tracks for beginners memorizing short Surahs.
95. **Hifz Streak & Milestones**: Celebrate completing a Juz, Surah, or 100 Ayahs.
96. **Voice Activity Auto-Advance**: (Experimental) Detect when the user finishes reciting an Ayah and automatically reveal/play the next.
97. **Speed-Reading Revision Mode**: Fast-paced `1.5x–2.0x` audio playback for rapid daily Muraja'ah.
98. **Flashcard Export**: Export tricky Ayahs/words to Anki (`.apkg` or CSV).
99. **10-Ayah Block Grouping**: Group long Surahs into manageable 10-Ayah chunks.
100. **Hifz Partner Sync**: Share a live room where two people can listen and test each other.

---

## 5. Translations, Tafsir & Linguistic Study (101–125)
101. **Multi-Translation Comparison**: View 2 or 3 translations stacked per Ayah (e.g., Sahih International + Yusuf Ali + Muhsin Khan).
102. **100+ Language Support**: Curated translations across English, Arabic, Urdu, Indonesian, Turkish, French, Spanish, Bengali, etc.
103. **Inline Footnotes**: Clickable footnote numbers in translations that open in a clean popover.
104. **Tafsir Drawer**: Read Ibn Kathir, Al-Jalalayn, Al-Sa'di, Al-Tabari, or Maarif-ul-Quran alongside any Ayah.
105. **Asbab al-Nuzul (Reasons for Revelation)**: Dedicated tab showing historical context for Ayahs where available.
106. **I'rab (Arabic Grammar) Analysis**: Grammatical breakdown of each word (noun, verb, case, tense, mood).
107. **Balaghah (Rhetoric) Notes**: Highlight rhetorical devices, metaphors, and eloquence in the text.
108. **Root Word Concordance**: Search any 3-letter Arabic root to see every derivative and Ayah where it appears.
109. **Dictionary Integration**: Built-in Lane's Lexicon / Hans Wehr / Almaany lookup on word click.
110. **Thematic Tafsir Tags**: Tag Ayahs by theme (e.g., Patience, Mercy, Law, Stories of Prophets).
111. **Prophet Stories Index**: Curated reading paths following the stories of Musa, Isa, Ibrahim, Yusuf, etc.
112. **Duas of the Quran**: Dedicated collection of all Rabbana and other Quranic supplications with audio.
113. **Parables (Amthal) Collection**: Curated list of Quranic parables with explanations.
114. **Scientific & Historical Context Notes**: Optional curated commentary tab.
115. **Translation Search**: Search within your selected translation language.
116. **Copy Ayah with Translation & Citation**: One-click copy formatted cleanly (e.g., `Surah Al-Baqarah 2:255`).
117. **Tafsir Audio / Podcast Links**: Link or play audio tafsir lectures for the current Surah.
118. **Compare Qira'at Differences**: Show notable variant readings (e.g., Hafs vs. Warsh) for scholarly study.
119. **Word Frequency Stats**: Show how many times a word or root appears in the Quran.
120. **Ayah Length & Complexity Indicator**: Helpful for learners choosing passages to study.
121. **Side-by-Side Arabic Tafsir**: Read Tafsir in original Arabic without switching app language.
122. **Glossary of Quranic Terms**: Quick-reference for terms like *Taqwa*, *Ihsan*, *Tawakkul*, *Barakah*.
123. **Cross-Language Word Alignment**: Hovering an English word highlights the corresponding Arabic word.
124. **Custom Translation Import**: Allow users to load a local JSON/CSV translation file.
125. **Study Mode Layout**: 3-column desktop layout: Surah/Juz nav | Mushaf/Ayah | Tafsir & Notes.

---

## 6. Search, Discovery & Cross-Referencing (126–150)
126. **Instant Command Palette (`Ctrl+K` / `Cmd+K`)**: Jump to any Surah, Ayah (`2:255`), Page (`p.42`), Juz (`j.30`), or setting.
127. **Fuzzy Arabic Search**: Search Arabic without needing exact diacritics (Tashkeel) or Hamzah forms (`أ`, `إ`, `آ`, `ا`).
128. **Phonetic / Arabizi Search**: Search Arabic words using Latin characters (e.g., `alhamdulillah`, `rahman`).
129. **Semantic / Topic Search**: Search by concept (e.g., "gratitude", "anxiety", "parents") even if the exact word isn't in the translation.
130. **Voice Search**: Speak an Arabic Ayah or English query into the microphone to jump to it.
131. **Search History & Saved Queries**: Quick access to recent searches.
132. **Filter Search by Makki / Madani**: Narrow search results by revelation period.
133. **Filter Search by Surah or Juz**: Scope search to a specific section.
134. **Cross-Reference Links**: "Related Ayahs" chips at the bottom of an Ayah card.
135. **Random Ayah ("Inspire Me")**: Button to jump to a random Ayah with reflection/tafsir.
136. **Ayah of the Day**: Daily featured Ayah on the home screen with audio and short reflection.
137. **Trending / Most-Read Surahs**: Quick-access cards for Al-Kahf (especially on Fridays), Yasin, Al-Mulk, Al-Waqi'ah.
138. **Friday Al-Kahf Reminder**: Subtle banner on Fridays offering one-click play/read for Surah Al-Kahf.
139. **Ramadan Khatam Navigator**: Quick-jump by Juz (`1–30`) with daily Ramadan progress.
140. **Sajdah Ayahs Directory**: List of all 15 Sajdah verses with one-click jump.
141. **Longest / Shortest Surahs Filter**: Sort Surah list by length, Ayah count, or revelation order.
142. **Search Within Current Surah**: `Ctrl+F` style in-page Ayah/word finder.
143. **Regex / Advanced Search**: Power-user search syntax for researchers.
144. **Search Result Snippets with Audio**: Play any search result directly from the search modal without leaving.
145. **Deep-Link URLs**: Every Surah, Ayah, Page, Reciter, and Timestamp has a clean shareable URL (e.g., `/2/255?reciter=mishary`).

---

## 7. Bookmarks, Notes & Personalization (151–175)
151. **Color-Coded Bookmarks**: Organize bookmarks into folders/tags (e.g., "Favorites", "To Memorize", "Reflect").
152. **Multiple Reading Positions**: Maintain separate "last read" markers (e.g., "Personal Khatam", "Study", "Taraweeh Prep").
153. **Rich-Text / Markdown Notes**: Attach formatted personal reflections to any Ayah.
154. **Text Highlighting**: Highlight specific words or phrases in yellow, green, blue, or pink.
155. **Export Notes & Bookmarks**: Export to Markdown, JSON, PDF, or Notion-friendly format.
156. **Import Bookmarks**: Import from JSON or other popular Quran apps.
157. **Local-First Storage (IndexedDB)**: All user data stored fast and privately in the browser by default.
158. **Optional Cloud Sync**: Sign in (e.g., OAuth / Passkey) to sync bookmarks, notes, and history across devices.
159. **Listening History Log**: Timeline of recently played Surahs/Ayahs with timestamps.
160. **Pinned Surahs**: Pin up to 5 Surahs to the home/sidebar for instant access.
161. **Custom Reciter Profiles**: Save preferred speed, EQ, and translation per reciter.
162. **Reading Profiles**: Switch between "Night Reading", "Hifz Practice", and "Deep Study" presets.
163. **Private Journal Mode**: Lock personal reflection notes behind a PIN/biometric prompt.
164. **Tagging System**: Create custom tags for Ayahs and filter by tag.
165. **Recently Viewed Pages**: Quick back/forward history stack for Mushaf navigation.

---

## 8. Daily Habits, Streaks & Goals (176–200)
176. **Daily Reading Goal**: Set a target in minutes, Ayahs, pages, or Rukus per day.
177. **Khatam Planner**: Set a target completion date (e.g., "Finish in 30 days") and get a daily page/Ayah quota.
178. **Gentle Streak Counter**: Track consecutive days of reading/listening without toxic guilt-tripping.
179. **Streak Freeze / Mercy Day**: Allow 1–2 missed days without breaking a streak.
180. **Weekly & Monthly Stats**: Clean charts showing minutes listened, pages read, and top Surahs.
181. **Activity Heatmap**: GitHub-style contribution calendar for daily Quran engagement.
182. **Daily Morning/Evening Adhkar**: Integrated morning & evening Azkar checklist with audio.
183. **Pre-Sleep Surah Checklist**: Quick-access checklist for Al-Mulk, Al-Sajdah, Ayat al-Kursi, and the 3 Quls.
184. **Browser/Push Reminders**: Optional gentle notifications for daily Wird or Friday Al-Kahf.
185. **Milestone Badges**: Subtle, tasteful achievements (e.g., "First Juz Completed", "10 Hours Listened").
186. **Pomodoro / Focus Timer**: 25-minute Quran study/memorization timer with break reminders.
187. **Session Summary**: Brief summary card when closing a long reading/listening session.
188. **Year-in-Review ("Kalamalah Wrapped")**: Annual summary of total time, favorite reciter, and most-read Surah.
189. **Ramadan Mode**: Special dashboard during Ramadan for 1-Juz-a-day tracking.
190. **Offline Goal Sync**: Queue goal progress offline and sync when reconnected.

---

## 9. UI/UX, Themes & GSAP Motion (201–225)
191. **Curated Theme Presets**: Light, Dark, AMOLED Black, Warm Sepia, Forest Green, Royal Navy, Desert Sand.
192. **System Theme Auto-Sync**: Automatically follow OS light/dark preference.
193. **Scheduled Theme Switching**: Switch to Sepia/Dark automatically after Maghrib/sunset.
194. **GSAP-Powered Micro-Interactions**: Tactile spring physics on play/pause, bookmark, and tab switches.
195. **Smooth Shared-Element Transitions**: Seamless transitions when expanding the mini-player to full-screen player.
196. **Ambient Dynamic Background**: Subtle, low-CPU gradient shift based on the current Surah or time of day.
197. **Glassmorphism / Translucent Player Bar**: Sleek floating bottom player bar with backdrop blur.
198. **Customizable Layout Density**: Compact, Comfortable, and Spacious UI modes.
199. **Collapsible Sidebars**: Smoothly animate left (navigation) and right (tafsir/notes) panels.
200. **Reduced Motion Mode**: Respect `prefers-reduced-motion` and provide an in-app toggle to disable animations.
201. **Swipe Gestures (Mobile)**: Swipe left/right to turn Mushaf pages; swipe down to minimize full player.
202. **Pull-to-Refresh / Pull-to-Search**: Intuitive mobile gestures.
203. **Haptic Feedback**: Subtle vibration on mobile for Ayah bookmarking, Sajdah, or page turns.
204. **Custom Accent Color**: Let users pick their preferred accent color (Emerald, Gold, Teal, Indigo).
205. **Zen / Screensaver Mode**: Full-screen ambient clock + current Ayah + audio visualizer for TVs or desk displays.
206. **Audio Visualizer**: Subtle, tasteful geometric/wave visualizer synced to the reciter's voice.
207. **Skeleton Loading States**: Smooth shimmer placeholders during SSR/hydration or audio fetch.
208. **Toast Notifications**: Non-intrusive, auto-dismissing toasts for "Bookmark saved", "Link copied", etc.
209. **Keyboard Shortcut Overlay (`?`)**: Clean modal listing all keyboard shortcuts.
210. **Full Keyboard Navigation**: `Space` (play/pause), `J`/`K` (next/prev Ayah), `Left`/`Right` (seek/page), `M` (mute), `F` (fullscreen).
211. **Context Menu (Right-Click)**: Right-click any Ayah for quick actions (Play from here, Copy, Bookmark, Tafsir).
212. **Responsive Tablet Split-View**: Optimized iPad/tablet layout in both portrait and landscape.
213. **Custom Scrollbar Styling**: Minimalist, theme-matched scrollbars.
214. **Empty State Illustrations**: Helpful, calm empty states for empty bookmarks/notes.
215. **Onboarding Tour**: Optional 3-step interactive walkthrough for first-time visitors.

---

## 10. Accessibility & Inclusive Design (226–245)
216. **Full Screen Reader Support (ARIA)**: Proper `aria-live` announcements for Ayah changes, play/pause, and navigation.
217. **High-Contrast Mode**: WCAG AAA compliant high-contrast theme for low-vision users.
218. **Dyslexia-Friendly Translation Font**: Option to use OpenDyslexic or Atkinson Hyperlegible for translations.
219. **Large-Print Mode**: Extra-large UI controls and text scaling up to `200%`.
220. **Focus Ring Indicators**: Clear, high-visibility keyboard focus outlines.
221. **Skip-to-Content Links**: Allow keyboard/screen-reader users to skip navigation straight to the Ayah/player.
222. **Colorblind-Safe Tajweed Palettes**: Alternative Tajweed color schemes for Deuteranopia, Protanopia, and Tritanopia.
223. **Captions / Live Transcript**: Always-visible synced translation acting as live closed captions.
224. **Single-Handed Mobile Mode**: Bottom-anchored controls for easy thumb reach on large phones.
225. **RTL & LTR UI Localization**: Full UI translation (Arabic, English, Urdu, French, Turkish, Indonesian, etc.).
226. **Audio Description / Spoken Navigation**: Optional TTS announcements for Surah/Ayah numbers when navigating blind.
227. **Adjustable Tap Targets**: Option for larger touch targets for users with motor impairments.
228. **No-Flash Guarantee**: Ensure no rapid flashing animations that could trigger photosensitive users.
229. **Plain-Text Fallback**: Ultra-lightweight HTML-only mode for assistive devices or e-readers.
230. **E-Ink / Kindle Optimization**: High-contrast monochrome mode with zero animations for e-ink tablets.

---

## 11. Offline, PWA & Caching (246–270)
231. **Installable PWA**: Full Web App Manifest + Service Worker for desktop and mobile installation.
232. **Offline Quran Text & Translations**: Cache the entire Quran text and selected translations locally (~5–10MB).
233. **Download Surah Audio for Offline**: One-click download of individual Surahs for offline listening.
234. **Download Full Juz / Full Quran**: Batch download manager with pause/resume and progress bar.
235. **Storage Quota Manager**: View how much cache/IndexedDB space is used and clear specific reciters/Surahs.
236. **Smart Pre-Fetching**: Automatically cache the next 3 Ayahs (or next Surah) in the background.
237. **Offline Indicator**: Subtle badge when offline, showing what content is available locally.
238. **Background Sync**: Sync bookmarks/notes/stats when the device comes back online.
239. **Wi-Fi Only Downloads**: Setting to prevent large audio downloads on metered cellular connections.
240. **Export/Import Offline Bundle**: Share downloaded audio/text bundles between devices on a local network.
241. **OPFS (Origin Private File System) Audio Storage**: Use modern OPFS for fast, reliable large audio file caching.
242. **Cache-First Static Assets**: Instant app shell load even with zero internet.
243. **Update Available Banner**: Friendly prompt when a new version of Kalamalah Player is ready.
244. **Auto-Clean Old Cache**: Automatically prune least-recently-played audio if storage runs low.
245. **Offline Search Index**: Local full-text search index (e.g., MiniSearch/FlexSearch) that works 100% offline.

---

## 12. Performance, SSR & Static Export (271–295)
246. **Hybrid SSR + Static Edge Caching**: Pre-render popular Surahs at build time, SSR others on demand with stale-while-revalidate.
247. **Zero-JS Initial Read**: Ensure the Arabic text and translation render immediately from SSR HTML before JS hydrates.
248. **Lazy-Load Heavy Modules**: Code-split Tafsir, EQ, Canvas visualizers, and Word-Root dictionaries.
249. **Virtual Scrolling for Long Surahs**: Virtualize Surah Al-Baqarah (286 Ayahs) so DOM size stays tiny and 60fps.
250. **Web Workers for Search & Sync**: Offload fuzzy Arabic search and word-timing calculations to a Web Worker.
251. **Font Subsetting & Preloading**: Subset Arabic/UI fonts and preload critical woff2 files to eliminate FOUT/FOIT.
252. **Image & Asset Optimization**: Serve WebP/AVIF for Mushaf page scans/ornaments with responsive `srcset`.
253. **HTTP/3 & Brotli Compression**: Optimize Hono server/CDN responses for minimal payload size.
254. **Audio CDN Failover**: Automatically fall back to a mirror CDN if a primary audio stream fails or stalls.
255. **Low-Bandwidth Mode**: Disable animations, ornaments, and pre-fetching on slow connections (`navigator.connection`).
256. **Memory Leak Guard**: Properly dispose Web Audio nodes, GSAP timelines, and event listeners on route changes.
257. **Bundle Size Budget**: Automated CI check keeping client JS bundle under a strict KB limit.
258. **Instant Link Prefetching**: Prefetch Surah data on hover/touchstart before the user even clicks.
259. **Service Worker Range Requests**: Properly handle `206 Partial Content` for seeking in cached audio files.
260. **Static Export (`build:static`) Enhancements**: Generate complete offline-ready static site bundles for GitHub Pages / Cloudflare Pages / IPFS.

---

## 13. Social, Sharing & Community (296–320)
261. **Ayah Image Card Generator**: Create beautiful, customizable quote cards (Arabic + Translation + Reciter/Surah) for Instagram/X/WhatsApp.
262. **Video / Reel Snippet Export**: Export a 15–60s MP4/WebM video of an Ayah with synced word highlighting and reciter audio.
263. **Shareable Timestamped Links**: Share a link that opens and plays at the exact Ayah and reciter.
264. **QR Code Sharing**: Generate a QR code for any Surah/Ayah for classroom or masjid use.
265. **Group Khatam Rooms**: Create a shared Khatam link where friends/family can claim Juz `1–30` and track collective completion.
266. **Listen Together (Sync Room)**: Real-time WebSocket room where a host controls playback for a study circle.
267. **Embeddable Ayah Widget**: Copyable `<iframe>` or Web Component snippet to embed a playable Ayah on blogs/websites.
268. **Community Curated Playlists**: Browse/share themed playlists (e.g., "Ayahs for Grief", "Ramadan Reflections").
269. **Feedback / Typo Report**: One-click button to report a sync offset issue or translation typo.
270. **Teacher Classroom Mode**: Broadcast current page/Ayah to students' devices in real time.

---

## 14. Integrations (PreMiD, OS Media, Smart Home, APIs) (321–350)
271. **Enhanced PreMiD Rich Presence**: Show Surah name, Ayah number, Reciter, and live progress bar on Discord.
272. **PreMiD Privacy Toggle**: Option to hide specific Surah/Ayah details on Discord ("Listening to Kalamalah").
273. **Media Session API (OS Controls)**: Full lock-screen, notification shade, and hardware media key support (Play, Pause, Next/Prev Ayah, Seek).
274. **Picture-in-Picture (PiP) Player**: Document Picture-in-Picture window showing synced Arabic + Translation while working in other apps.
275. **Chromecast / Google Cast Support**: Cast audio + synced Ayah display to TVs and smart speakers.
276. **AirPlay Support**: Native AirPlay audio/video routing on Safari/iOS/macOS.
277. **Desktop App Wrapper (Tauri / Electron)**: Lightweight native desktop app with system tray mini-player and global hotkeys.
278. **Browser Extension**: Quick-access popup player in Chrome/Firefox/Edge.
279. **Raycast / Alfred Extension**: Control Kalamalah Player and search Ayahs directly from macOS/Windows launchers.
280. **Obsidian / Notion Integration**: Copy Ayahs formatted as Obsidian callouts or Notion blocks.
281. **Public REST / GraphQL API**: Expose `kalamalah-quran-api` endpoints for third-party developers.
282. **Webhook / Automation Support**: Trigger webhooks on daily goal completion or Khatam.
283. **Home Assistant Integration**: Trigger Surah playback on smart speakers at Fajr/Maghrib.
284. **Android Auto / Apple CarPlay**: Audio-first interface for safe in-car listening.
285. **RSS / Podcast Feed**: Generate a personal podcast feed of a reciter's Surahs.

---

## 15. Developer Experience, Testing & Telemetry (351–375)
286. **TypeScript Strict Mode**: Enforce strict typing across `src/server` and `src/client`.
287. **Unit Tests (Bun Test)**: Test Ayah parsing, offset calculations, and search normalization.
288. **E2E Tests (Playwright)**: Automated tests for playback, Mushaf page turns, and SSR hydration.
289. **Visual Regression Testing**: Screenshot diffs for Mushaf layouts across viewports.
290. **Audio Sync Validator CLI**: Script to verify `offsets.json` against actual audio durations.
291. **Privacy-First Analytics**: Self-hosted, cookie-free metrics (e.g., Umami/Plausible) with zero personal tracking.
292. **Error Boundary & Graceful Degradation**: Friendly recovery UI if audio or API fails.
293. **Debug / DevTools Overlay**: Hidden dev panel (`?debug=1`) showing audio buffer state, sync offset ms, and FPS.
294. **Docker Multi-Stage Optimization**: Minimal production container image with healthchecks.
295. **Automated Accessibility Audit**: CI check using `axe-core` to catch contrast or ARIA regressions.

---

## 16. Prayer Times, Qibla & Islamic Utilities (376–400)
296. **Local Prayer Times Widget**: Subtle header/sidebar widget showing next prayer countdown (using Adhan.js, 100% client-side).
297. **Auto-Pause for Adhan/Prayer**: Automatically pause Quran playback when a prayer time arrives.
298. **Qibla Compass**: Built-in Qibla direction finder using device orientation/geolocation.
299. **Hijri Calendar Display**: Show current Hijri date alongside Gregorian date, with white days (Ayyam al-Bid) indicators.
300. **Zakat / Sadaqah Reminder**: Optional gentle Ramadan/Zakat calculator or charity link.

---

> *Note: Items 301–400 can be expanded from any of the above categories (e.g., deeper Qira'at support, AI-assisted Tajweed feedback, multi-profile family accounts, or custom Mushaf calligraphy packs) as the project grows.*
