// Narration script. t = target start time (s) on the 480 s master timeline.
// Every number below is traceable to data/SOURCES.md (NASA, ESA, university lecture notes, peer-reviewed reviews).
export const LINES = [
  // ---- HOOK 0-24 ----
  { id: 'h1', t: 1.4, text: 'Right now, light from a star is landing on your skin.' },
  { id: 'h2', t: 6.5, text: 'A giant ball of glowing plasma, burning for billions of years. But what is actually inside it?' },
  { id: 'h3', t: 14.2, text: 'Today, we dive inside. From the surface, all the way down to the core.' },
  { id: 'h4', t: 20.9, text: "Then, we'll watch a giant star die." },
  // ---- MEET THE STAR 24-64 ----
  { id: 'm1', t: 25.0, text: "Our star is the Sun. It looks small in the sky, but it's enormous." },
  { id: 'm1b', t: 31.5, text: 'Its diameter is about one point four million kilometres.' },
  { id: 'm1c', t: 35.8, text: "Let's put that in perspective." },
  { id: 'm2', t: 38.6, text: 'Line up Earths across its face, and it takes about one hundred and nine of them.' },
  { id: 'm3', t: 46.0, text: 'About one point three million Earths could fit inside.' },
  { id: 'm4', t: 50.4, text: 'Gravity is crushing it inward, while fusion heat pushes outward. A perfect balance.' },
  { id: 'm5', t: 56.6, text: "It's not solid at all, just hot plasma, mostly hydrogen and helium." },
  // ---- ATMOSPHERE 64-112 ----
  { id: 'a1', t: 64.6, text: "Our dive begins in the corona, the Sun's outer atmosphere." },
  { id: 'a2', t: 69.2, text: "Here's a mystery. This thin atmosphere is hotter than a million degrees." },
  { id: 'a3', t: 74.8, text: 'But the surface below it is only about five and a half thousand. Why? Scientists are still debating it.' },
  { id: 'a4', t: 84.2, text: 'Next, the chromosphere, where jets called spicules shoot up to ten thousand kilometres.' },
  { id: 'a5', t: 91.0, text: "Below that is the photosphere, the part we actually see. It's boiling plasma, not rock." },
  { id: 'a6', t: 98.8, text: 'Now, we cross the surface, and go inside.' },
  { id: 'a7', t: 102.6, text: "How do we know what's down there? We listen. Sound waves ringing through the Sun map its interior." },
  // ---- CONVECTION 112-172 ----
  { id: 'c1', t: 112.8, text: 'This is the convection zone. About two hundred thousand kilometres deep.' },
  { id: 'c2', t: 118.2, text: 'Down here, the plasma is boiling.' },
  { id: 'c3', t: 121.2, text: 'Hot plasma rises, cooler plasma sinks, like a pot of boiling water, only far bigger.' },
  { id: 'c4', t: 128.3, text: 'The temperature falls from about two million degrees at the bottom, to five and a half thousand at the top.' },
  { id: 'c5', t: 140.6, text: 'Those rising cells are the bubbling pattern you saw on the surface.' },
  { id: 'c6', t: 149.2, text: "And here's the twist. Moving, electrically charged plasma creates magnetic fields." },
  { id: 'c7', t: 155.0, text: 'Those tangled fields drive sunspots, flares and solar storms that can reach Earth.' },
  { id: 'c8', t: 162.0, text: 'Keep going down. The boiling slowly calms.' },
  { id: 'c9', t: 165.5, text: "We're approaching a thin, strange boundary." },
  // ---- TACHOCLINE 172-190 ----
  { id: 't1', t: 172.8, text: "This is the tachocline. A thin layer where the Sun's magnetic field is thought to be born." },
  { id: 't2', t: 180.8, text: 'Above it, the Sun spins at different speeds at different latitudes. Below, it rotates like a solid ball.' },
  // ---- RADIATIVE 190-250 ----
  { id: 'r1', t: 190.6, text: "Welcome to the radiative zone. It's so dense that plasma cannot boil here." },
  { id: 'r2', t: 196.8, text: 'So energy has to travel as light.' },
  { id: 'r3', t: 200.3, text: 'A photon travels only a tiny distance, gets absorbed, and is re-emitted in a random direction.' },
  { id: 'r4', t: 207.6, text: 'Follow this one photon. It never goes straight. It stumbles, a random walk, trillions of times.' },
  { id: 'r5', t: 215.2, text: 'Quick question. How long does one photon take to escape the Sun?' },
  { id: 'r6', t: 220.8, text: 'Eight minutes? A hundred years? Think about it.' },
  { id: 'r7', t: 225.4, text: 'The answer: somewhere between ten thousand and one hundred and seventy thousand years.' },
  { id: 'n1', t: 233.4, text: 'Neutrinos, also made by fusion, barely touch anything.' },
  { id: 'n2', t: 237.3, text: 'They cross the entire Sun in about two seconds.' },
  { id: 'r8', t: 241.6, text: 'While the light that warms you today left the core tens of thousands of years ago.' },
  // ---- CORE 250-285 ----
  { id: 'k1', t: 250.6, text: 'Now, the core. The engine of the star.' },
  { id: 'k2', t: 254.4, text: "Just three percent of the Sun's volume," },
  { id: 'k3', t: 258.0, text: 'but thirty-four percent of its mass,' },
  { id: 'k4', t: 261.2, text: 'and ninety-nine percent of its fusion power.' },
  { id: 'k5', t: 265.4, text: 'Fifteen million degrees. Pressure about two hundred and fifty billion atmospheres.' },
  { id: 'k6', t: 276.2, text: 'Atoms are torn apart. Bare nuclei are forced to collide.' },
  { id: 'k7', t: 281.0, text: "Let's zoom in. Far closer than any microscope." },
  // ---- FUSION 285-345 ----
  { id: 'f1', t: 285.8, text: 'Welcome to the heart of fusion. These are protons, the nuclei of hydrogen.' },
  { id: 'f2', t: 292.0, text: 'They carry the same electric charge, so they repel each other, violently.' },
  { id: 'f3', t: 297.6, text: 'But in the core, they move fast enough, and are squeezed tightly enough, to occasionally get close.' },
  { id: 'f4', t: 305.8, text: 'Step one. Two protons collide, and one transforms into a neutron, releasing a positron and a neutrino.' },
  { id: 'f5', t: 313.6, text: 'Now we have deuterium, a heavy hydrogen. Another proton joins, making helium-3, and a flash of gamma rays.' },
  { id: 'f6', t: 322.0, text: 'Finally, two helium-3 nuclei collide, forming helium-4, and releasing two protons back.' },
  { id: 'f7', t: 328.5, text: 'Four hydrogen nuclei in, one helium nucleus out. But the helium weighs slightly less.' },
  { id: 'f8', t: 335.0, text: "About zero point seven percent of the mass vanishes, converted to energy, by Einstein's E equals m c squared." },
  // ---- BALANCE & CNO 345-385 ----
  { id: 'b1', t: 345.8, text: 'Every second, the Sun turns about four million tonnes of its mass into pure energy.' },
  { id: 'b2', t: 352.8, text: "Why doesn't it explode? It's a thermostat." },
  { id: 'b3', t: 355.8, text: 'If fusion speeds up, the core expands and cools. If it slows, the core shrinks and heats up.' },
  { id: 'b4', t: 364.0, text: 'Stars heavier than about one point three Suns use another route, the CNO cycle, with carbon as a catalyst.' },
  { id: 'b5', t: 372.8, text: 'And the heavier the star, the faster it burns through its fuel.' },
  { id: 'b6', t: 378.4, text: 'The Sun: ten billion years. A giant star: just a few million.' },
  // ---- ONION 385-425 ----
  { id: 'o1', t: 385.8, text: 'What happens when a star is much heavier, say twenty-five times our Sun?' },
  { id: 'o2', t: 392.0, text: "It doesn't stop at helium. As each fuel runs out, the core squeezes, heats up, and starts burning the ash." },
  { id: 'o3', t: 401.2, text: 'Carbon, then neon, then oxygen, then silicon. Each stage builds a new layer.' },
  { id: 'o4', t: 407.4, text: 'The star becomes an onion, layer upon layer, with iron at the center.' },
  { id: 'o5', t: 413.6, text: 'And the timeline is terrifying. Hydrogen lasts seven million years. Silicon? About one day.' },
  { id: 'o6', t: 420.2, text: 'Iron cannot release energy by fusion. The engine has stopped.' },
  // ---- COLLAPSE 425-462 ----
  { id: 'x1', t: 425.6, text: 'The iron core grows until it reaches about one point four times the mass of our Sun.' },
  { id: 'x2', t: 433.3, text: 'Then, electron pressure fails. Gravity wins.' },
  { id: 'x3', t: 436.4, text: 'In less than a second, a core thousands of kilometres across collapses to a ball just tens of kilometres wide.' },
  { id: 'x4', t: 445.4, text: 'The core hits nuclear density, bounces, and a shockwave blasts outward.' },
  { id: 'x5', t: 451.0, text: 'A supernova. For a short time, it can outshine billions of stars.' },
  { id: 'x6', t: 456.6, text: 'What remains: a neutron star, or a black hole.' },
  // ---- STARDUST 462-480 ----
  { id: 'd1', t: 462.6, text: 'And the explosion scatters iron, silicon and oxygen across space.' },
  { id: 'd2', t: 467.3, text: 'Heavy elements, forged in stars like this, end up in new planets, and in us.' },
  { id: 'd3', t: 473.8, text: 'We are all made of stardust. Thanks for watching.' },
];

// YouTube Short: whole narration lines from the master film, re-edited into one portrait cut.
export const SHORT_IDS = ['h1', 'm2', 'a2', 'a3', 'c3', 'r7', 'f8', 'x3', 'x5'];
export const WORDS_PER_SEC = 2.3; // fallback estimate when no TTS timing exists
