/**
 * The roster of attendants the host gives through `attend`. What matters: a count adds members from the first free index, each with the
 * moment it joined; a lower count takes away the highest members and keeps the others with their entrance; a count is held between 0
 * and the attendant's maximum; other attendants are untouched; and the members are placed by their attendant at the time asked.
 */
import { expect, test } from 'bun:test';

import { attendantMembersAt, EMPTY_ATTENDANT_ROSTER, rosterAttended } from './AttendantRoster.ts';

test('a count adds the members that are missing, each joining now', () => {
  const two = rosterAttended(EMPTY_ATTENDANT_ROSTER, 'watcher-spark', 2, 100);
  const three = rosterAttended(two, 'watcher-spark', 3, 900);
  expect(three).toEqual([
    { name: 'watcher-spark', index: 0, joinedAtMilliseconds: 100 },
    { name: 'watcher-spark', index: 1, joinedAtMilliseconds: 100 },
    { name: 'watcher-spark', index: 2, joinedAtMilliseconds: 900 },
  ]);
});

test('a lower count takes away the highest members and keeps the rest as they joined; 0 takes all away', () => {
  const three = rosterAttended(EMPTY_ATTENDANT_ROSTER, 'watcher-spark', 3, 100);
  expect(rosterAttended(three, 'watcher-spark', 1, 900)).toEqual([{ name: 'watcher-spark', index: 0, joinedAtMilliseconds: 100 }]);
  expect(rosterAttended(three, 'watcher-spark', 0, 900)).toEqual([]);
});

test('a count is held between 0 and the maximum, and a part of one is dropped', () => {
  expect(rosterAttended(EMPTY_ATTENDANT_ROSTER, 'watcher-spark', 9, 0)).toHaveLength(4);
  expect(rosterAttended(EMPTY_ATTENDANT_ROSTER, 'watcher-spark', -2, 0)).toHaveLength(0);
  expect(rosterAttended(EMPTY_ATTENDANT_ROSTER, 'watcher-spark', 2.7, 0)).toHaveLength(2);
});

test('each member is placed by its attendant at the time asked, with its age since it joined', () => {
  const roster = rosterAttended(EMPTY_ATTENDANT_ROSTER, 'watcher-spark', 2, 1000);
  const members = attendantMembersAt(roster, 1000, true);
  expect(members.map((member) => [member.name, member.index, member.x, member.y, member.scale])).toEqual([
    ['watcher-spark', 0, -7, -49, 1],
    ['watcher-spark', 1, -13, -42, 1],
  ]);
  expect(attendantMembersAt(roster, 1000, false).map((member) => member.scale)).toEqual([0, 0]);
});
