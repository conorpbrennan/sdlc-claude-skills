# Rename the config key

Status: ready. Tier T0.

## 1. What this delivers, and what it does not

Renames `timeout` to `timeout_seconds` in `src/config.js`. It does not change the default.

## 2. Working constraints

- Repo: `example`, branch `rename-timeout`.
- Tests first for any code change.

**1. Rename the key**
EXTEND `src/config.js`, `src/test-config.js`.
WHAT TO BUILD: rename the key and update the one caller.
GATE: `node src/test-config.js` exits 0.
REVIEW: does any caller still read the old key?

**2. Update the docs**
EXTEND `README.md`.
WHAT TO BUILD: change the key name in the config table.
GATE: `grep -c timeout_seconds README.md` prints 1 or more.
REVIEW: is the old name gone from the README?

## 7. Definition of done

Both gates exit 0 and the old key appears nowhere in the repo.
