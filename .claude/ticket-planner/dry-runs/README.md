# Dry runs

One folder per initiative. Each is created by `/plan-tickets`, reviewed while it
is still only files, and only then replayed into Asana.

```
<initiative-slug>/
├── tickets-MMDDYYYY.jsonl   the tickets — the editable source of record
├── state-MMDDYYYY.json      local_id → GID/permalink, replay progress, sync baseline
├── README.md                origin, design decisions, open questions, replay command
├── recommended-order.md     dependency-aware build order
└── asana-map.md             planner ID ↔ Asana permalink table
```

These files are **committed**. The state file is the only mapping from a planner
ID like `WEB-CTA-3` to an Asana GID, so losing it orphans every task on the
board.

See [../asana-planner-guide.md](../asana-planner-guide.md) for the commands and
the sync model.
