// Injectable clock so the simulator and tests can travel through a day.
let offset = null;
module.exports = {
  now: () => (offset === null ? Date.now() : offset),
  set: (ms) => { offset = ms; },
  advance: (ms) => { offset = (offset === null ? Date.now() : offset) + ms; },
  reset: () => { offset = null; },
};
