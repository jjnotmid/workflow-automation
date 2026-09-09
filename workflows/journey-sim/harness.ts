/**
 * Journey simulator.
 *
 * Drives the real system through the journeys a real person takes, with the
 * unreliable parts stubbed out by something recognisable, so that "this
 * feature only works when the model happens to cooperate" shows up as a
 * failing test instead of as a complaint from a user three weeks later.
 *
 * The trick is the fallback marker. Stub whatever your system leans on when
 * it does not know what to do (an LLM, a catch-all handler, a generic error
 * page) so it returns one unmistakable string, then treat any journey that
 * reaches that string as a failure. Everything a user deserves a dependable
 * answer to has to be handled before that point. What is left over is your
 * real coverage gap, and it is usually much bigger than it feels.
 *
 * No test framework is imported here on purpose. It runs under vitest, jest,
 * node --test, or a plain script, because a harness that only works inside
 * one runner is a harness you will not reuse.
 *
 * Copied into a project by `wa-simulate init`. Source of truth lives in
 * ~/Workflow Automation/workflows/journey-sim/harness.ts.
 */

// ── types ──────────────────────────────────────────────────────────────

export interface SimulatorConfig<Ctx> {
  /**
   * The unique string your stubbed dependency returns. Any journey that
   * reaches it is counted as falling through. Make it something that can
   * never appear by accident, e.g. "[[FELL-THROUGH]]".
   */
  readonly fallback: string;

  /**
   * Build a fresh, isolated world for one session: a seeded user, a temp
   * directory, an empty database row. Called once per session, and given a
   * unique id so two sessions never share state. Isolation is what lets a
   * hundred journeys run in one process without one poisoning the next.
   */
  setup(id: string): Promise<Ctx> | Ctx;

  /**
   * Push one input through the REAL system and return everything it emitted,
   * in order. Keep the system real here. The whole value of this harness is
   * that only the stub is fake.
   */
  drive(ctx: Ctx, input: string): Promise<readonly string[]> | readonly string[];

  /** Optional cleanup once a session is finished with. */
  teardown?(ctx: Ctx): Promise<void> | void;

  /**
   * Strip formatting before matching, so an expectation does not have to know
   * whether the output is HTML, markdown or plain. Defaults to removing
   * angle-bracket tags.
   */
  normalise?(output: string): string;
}

export interface Turn {
  readonly input: string;
  readonly outputs: readonly string[];
  /** Everything emitted for this input, joined, formatting stripped. */
  readonly text: string;
  /** True when this turn reached the stub instead of a real handler. */
  readonly fellThrough: boolean;
}

/** One declarative step. `run` is the escape hatch for anything else. */
export interface Step<Ctx> {
  readonly say: string;
  /** The reply must match this. */
  readonly expect?: RegExp | string;
  /** The reply must NOT match this. Catches the wrong handler answering. */
  readonly notExpect?: RegExp | string;
  /** Allow this step to reach the stub (rare, and worth justifying). */
  readonly mayFallThrough?: boolean;
  /** Arbitrary extra checking, for when a regex is not enough. */
  readonly check?: (turn: Turn, ctx: Ctx) => void | Promise<void>;
}

export interface Failure {
  readonly journey: string;
  readonly step: number;
  readonly input: string;
  readonly reason: string;
  readonly got: string;
}

export interface JourneyResult {
  readonly name: string;
  readonly turns: readonly Turn[];
  readonly failures: readonly Failure[];
  readonly ok: boolean;
}

/** A named group of phrasings that must all reach a real handler. */
export interface SweepGroup {
  readonly inputs: readonly string[];
  /** Every reply in this group should match this. */
  readonly want?: RegExp;
  /** No reply in this group may match this. The wrong-handler detector. */
  readonly mustNot?: RegExp;
}

export interface SweepRow {
  readonly group: string;
  readonly input: string;
  readonly fellThrough: boolean;
  readonly wrongHandler: boolean;
  readonly missedWant: boolean;
  readonly reply: string;
}

export interface SweepResult {
  readonly rows: readonly SweepRow[];
  readonly total: number;
  readonly fellThrough: readonly SweepRow[];
  readonly wrongHandler: readonly SweepRow[];
  readonly missedWant: readonly SweepRow[];
  readonly ok: boolean;
}

// ── the simulator ──────────────────────────────────────────────────────

export interface Session<Ctx> {
  readonly id: string;
  readonly ctx: Ctx;
  readonly turns: readonly Turn[];
  /** Send one input, get the turn back. */
  say(input: string): Promise<Turn>;
  /** Everything said so far, joined. Handy for "it never said X anywhere". */
  transcript(): string;
  /** Everything since a marker, for asserting on just the latest exchange. */
  since(mark: number): string;
  close(): Promise<void>;
}

export function createSimulator<Ctx>(config: SimulatorConfig<Ctx>) {
  const strip = config.normalise ?? ((s: string) => s.replace(/<[^>]+>/g, ""));
  let counter = 0;

  async function session(idHint?: string): Promise<Session<Ctx>> {
    const id = idHint ?? `sim-${String(++counter).padStart(4, "0")}`;
    const ctx = await config.setup(id);
    const turns: Turn[] = [];

    return {
      id,
      ctx,
      turns,
      async say(input: string): Promise<Turn> {
        const outputs = [...(await config.drive(ctx, input))];
        const raw = outputs.join("\n");
        const text = strip(raw);
        // Looked for in the RAW output, not the normalised text. The default
        // normaliser strips <...> tags, so a marker like <FALLBACK> or <STUB>
        // was deleted before this check ever saw it: every fallen-through
        // turn reported clean and the suite went green while every input had
        // reached the stub. That is the exact failure this harness exists to
        // catch, so the check must not depend on how output is tidied.
        const turn: Turn = { input, outputs, text, fellThrough: raw.includes(config.fallback) };
        turns.push(turn);
        return turn;
      },
      transcript() {
        return strip(turns.flatMap((t) => t.outputs).join("\n"));
      },
      since(mark: number) {
        return strip(turns.slice(mark).flatMap((t) => t.outputs).join("\n"));
      },
      async close() {
        await config.teardown?.(ctx);
      },
    };
  }

  function matches(pattern: RegExp | string, text: string): boolean {
    return typeof pattern === "string" ? text.includes(pattern) : pattern.test(text);
  }

  /**
   * Run one journey to the end, collecting every failure rather than
   * stopping at the first. A journey that breaks at step 2 usually breaks at
   * step 5 as well, and you want to see both in one run.
   */
  async function journey(name: string, steps: readonly Step<Ctx>[]): Promise<JourneyResult> {
    const s = await session();
    const failures: Failure[] = [];
    // Everything below runs inside try/finally so config.teardown always
    // gets its turn. Without it, one throw from drive() left that session's
    // temp directory, database row or container behind, and a CI run of many
    // journeys accumulated orphans until the host ran out of something.
    try {

    for (const [i, step] of steps.entries()) {
      const turn = await s.say(step.say);
      const fail = (reason: string) =>
        failures.push({ journey: name, step: i + 1, input: step.say, reason, got: turn.text.slice(0, 200) });

      if (turn.fellThrough && !step.mayFallThrough) {
        fail("fell through to the stub, so this depends on the model guessing");
      }
      if (step.expect && !matches(step.expect, turn.text)) {
        fail(`expected ${String(step.expect)}`);
      }
      if (step.notExpect && matches(step.notExpect, turn.text)) {
        fail(`must not match ${String(step.notExpect)}, the wrong handler answered`);
      }
      if (step.check) {
        try {
          await step.check(turn, s.ctx);
        } catch (e) {
          fail(String(e instanceof Error ? e.message : e));
        }
      }
    }

    return { name, turns: s.turns, failures, ok: failures.length === 0 };
    } finally {
      await s.close();
    }
  }

  /**
   * Fire many phrasings of the same intent at a fresh session each and record
   * which ones reach a real handler. This is the part that finds the bugs
   * nobody thought to write a test for, because it asks the same question the
   * eleven ways real people ask it rather than the one way you had in mind.
   */
  async function sweep(groups: Record<string, SweepGroup | readonly string[]>): Promise<SweepResult> {
    const rows: SweepRow[] = [];

    for (const [group, raw] of Object.entries(groups)) {
      const spec: SweepGroup = Array.isArray(raw) ? { inputs: raw } : (raw as SweepGroup);
      for (const input of spec.inputs) {
        const s = await session();
        try {
          const turn = await s.say(input);
          rows.push({
            group,
            input,
            fellThrough: turn.fellThrough,
            wrongHandler: Boolean(spec.mustNot && spec.mustNot.test(turn.text)),
            missedWant: Boolean(spec.want && !spec.want.test(turn.text)),
            reply: turn.text.replace(/\s+/g, " ").trim(),
          });
        } finally {
          // Always, so a failure on one phrasing does not strand its session
          // and take the rest of the sweep down with it.
          await s.close();
        }
      }
    }

    // Each row is counted once, in the most specific class that applies.
    //
    // These used to overlap: a reply that matched mustNot usually also fails
    // want, so the same row landed in both lists and the summary arithmetic
    // went with it, printing things like "3 phrasings, -3 handled, 6 not".
    const fellThrough = rows.filter((r) => r.fellThrough);
    const wrongHandler = rows.filter((r) => !r.fellThrough && r.wrongHandler);
    const missedWant = rows.filter((r) => !r.fellThrough && !r.wrongHandler && r.missedWant);
    return {
      rows,
      total: rows.length,
      fellThrough,
      wrongHandler,
      missedWant,
      ok: fellThrough.length === 0 && wrongHandler.length === 0 && missedWant.length === 0,
    };
  }

  return { session, journey, sweep };
}

// ── reporting ──────────────────────────────────────────────────────────

const MARK = { ok: "  ok  ", fell: " MODEL", wrong: " WRONG", missed: " MISS " } as const;

/** A readable coverage table. Print it; it is the whole point of a sweep. */
export function formatSweep(result: SweepResult, opts: { width?: number } = {}): string {
  const width = opts.width ?? 52;
  const out: string[] = [];
  let current = "";

  for (const r of result.rows) {
    if (r.group !== current) {
      current = r.group;
      out.push("", `## ${current}`);
    }
    const mark = r.fellThrough ? MARK.fell : r.wrongHandler ? MARK.wrong : r.missedWant ? MARK.missed : MARK.ok;
    out.push(`${mark}  ${pad(`"${r.input}"`, 44)} ${r.reply.slice(0, width)}`);
  }

  const bad = result.fellThrough.length + result.wrongHandler.length + result.missedWant.length;
  // Built with the zero counts dropped HERE, rather than by filtering every
  // empty line out of the whole document at the end. That filter also ate the
  // blank lines pushed above to separate the group headings, so every group
  // ran together into one wall of text and the headings stopped doing their
  // only job.
  const summary = [
    `${result.total} phrasings, ${result.total - bad} handled, ${bad} not.`,
    result.fellThrough.length ? `  ${result.fellThrough.length} fell through to the model` : null,
    result.wrongHandler.length ? `  ${result.wrongHandler.length} answered by the WRONG handler` : null,
    result.missedWant.length ? `  ${result.missedWant.length} handled but said the wrong thing` : null,
  ].filter((l): l is string => l !== null);

  out.push("", ...summary);
  // Only the very first line can be a leading blank, from the first group.
  return out.join("\n").replace(/^\n/, "");
}

/** Every failure across a set of journeys, ready to paste into a report. */
export function formatFailures(results: readonly JourneyResult[]): string {
  const failures = results.flatMap((r) => r.failures);
  if (!failures.length) return `All ${results.length} journeys passed.`;
  const lines = failures.map(
    (f) => `${f.journey} · step ${f.step}\n  said:   "${f.input}"\n  problem: ${f.reason}\n  got:    ${f.got.replace(/\s+/g, " ").slice(0, 160)}`,
  );
  return [`${failures.length} failures across ${results.length} journeys:`, "", ...lines].join("\n");
}

function pad(s: string, n: number): string {
  return s.length >= n ? `${s.slice(0, n - 1)}…` : s + " ".repeat(n - s.length);
}

/**
 * Throw if anything failed. Call this from one test in whatever runner the
 * project already uses, so the simulation gates CI without the harness
 * needing to know which runner that is.
 *
 * Sweeps are summarised rather than reprinted: the caller has usually just
 * shown the full table, and dumping it twice buries the journey failures
 * underneath a wall of text you already read.
 */
export function assertClean(results: readonly JourneyResult[], sweeps: readonly SweepResult[] = []): void {
  const problems: string[] = [];
  const failed = results.filter((r) => !r.ok);
  if (failed.length) problems.push(formatFailures(failed));

  for (const s of sweeps) {
    if (s.ok) continue;
    const parts = [
      ...s.fellThrough.map((r) => `  fell through: "${r.input}"`),
      ...s.wrongHandler.map((r) => `  wrong handler: "${r.input}" answered "${r.reply.slice(0, 60)}"`),
      ...s.missedWant.map((r) => `  wrong answer: "${r.input}" said "${r.reply.slice(0, 60)}"`),
    ];
    problems.push([`Sweep: ${parts.length} of ${s.total} phrasings not handled properly.`, ...parts].join("\n"));
  }

  if (problems.length) throw new Error(`\n${problems.join("\n\n")}\n`);
}
