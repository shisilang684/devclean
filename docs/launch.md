# Launch kit

Everything below is ready to paste. Adapt the numbers to your own machine - real
output beats polished copy.

## Before you post (30 minutes)

- [ ] `npm publish` succeeded and `npx devclean` works from a clean shell
- [ ] Repo has a description, topics, and the demo image renders on GitHub
- [ ] README first screen answers: what, why, how, how fast
- [ ] CI badge is green
- [ ] Social preview uploaded in Settings -> General (docs/social-preview.png, 1280x640)
- [ ] You are available to reply for the next 4 hours

## Show HN

**Title**

> Show HN: devclean - find and reclaim what your dev tools are hoarding

**Body**

> I kept running out of disk space, and every cleaner I tried either only knew about
> node_modules or wanted to delete 60 GB of downloaded model weights without telling me.
>
> devclean scans 22 cache families in one pass - npm/pnpm/Yarn/Bun, pip/uv, Cargo, Go,
> Gradle, Maven, Playwright, Puppeteer, Hugging Face, Ollama, LM Studio - and labels each
> one by risk. `devclean clean` shows the list and the total first, then asks. High-risk
> items (local LLM weights) are skipped unless you pass `--all`. `--dry-run` deletes nothing.
>
> It is zero-dependency TypeScript, works on Windows/macOS/Linux, and `npx devclean` just runs.
> There is also `devclean report` which writes a self-contained HTML treemap you can hand to
> whoever is asking why the build machine is full.
>
> I would love feedback on which caches I missed - that is the part I am least sure about.

Post Tuesday-Thursday, 08:00-10:00 Pacific. Do not ask for stars.

## Reddit

**r/commandline** - title: `devclean: one command to see every dev cache on your machine`
(link post to the repo; follow the subreddit's self-promotion rules, answer in comments.)

**r/webdev / r/programming** - only if you have something to say beyond the link: post the
number you reclaimed and what surprised you. Plain links get removed.

## V2EX（分享创造）

**标题**：写了个 CLI，一次看清并清理所有开发缓存（包括 AI 模型）

**正文**：

> 磁盘又满了，npkill 只认 node_modules，清理软件又分不清哪些是我的模型权重。
> 于是写了个 devclean：一次扫描 npm/pnpm/pip/cargo/gradle/playwright/Hugging Face/
> Ollama 等 22 类缓存，按风险分级，`clean` 先列清单再确认，`--dry-run` 只预览。
> `devclean report` 能生成一个自带 treemap 的 HTML，方便贴给同事看。
> 零依赖，Windows/macOS/Linux 都能跑，`npx devclean` 直接用。
> 求补充我漏掉的缓存路径。

## 掘金 / 少数派

写成"教程 + 数据"而不是"求 star"：先展示清理前后的磁盘占用截图，再讲 22 类缓存的
位置和风险，最后一句放仓库链接。

## X / Twitter

> your dev machine is hoarding gigabytes
>
> npm, pnpm, pip, cargo, gradle, playwright, Hugging Face, Ollama...
>
> one command finds all of it and tells you what is safe to delete:
>
> npx devclean
>
> [screenshot]

Attach the terminal screenshot, not a link card.

## awesome-lists

Open PRs (one at a time, follow each list's format):
- sindresorhus/awesome-nodejs (CLI utilities)
- awesome-cli-apps
- awesome-windows / awesome-macos (developer tools sections)
- awesome-selfhosted? no - wrong category
- jaywcjlove/awesome-mac

PR description: one sentence, link, and the fact that it is cross-platform and zero-dep.

## Newsletters

Pitch to Node Weekly, JavaScript Weekly, TLDR, Console DevTools:

> Subject: devclean - reclaim dev caches including AI model weights
>
> Hi, I built devclean, a zero-dependency CLI that scans 22 cache families (npm, pip,
> cargo, gradle, Playwright, Hugging Face, Ollama...) and shows what is safe to delete.
> It is cross-platform, MIT, and works via npx. Happy to send a short blurb or answer
> questions.

## Launch-day timeline (Pacific)

| Time | Action |
| --- | --- |
| 07:30 | final smoke test, publish, check badges |
| 08:00 | Show HN + X thread |
| 08:15 | V2EX + Reddit |
| 08:00-12:00 | reply to every comment, fix anything broken immediately |
| 12:00 | post the HTML report screenshot as a comment ("here is what it looks like") |
| 18:00 | thank-you edit on HN, note any fixes shipped that day |

## After the spike

- Reply to every issue within 24h for two weeks.
- Ship a visible improvement within 7 days: it converts one-time visitors into watchers.
- Write a short "what I learned launching" post and link it back to the repo.

## Prepared answers (launch day)

**"How is this different from npkill / cleanmymac / BleachBit?"**
> npkill only knows node_modules. Cleaners either ignore caches or treat model weights like
> disposable files. devclean covers 22 families in one pass and labels risk, so you decide
> per item - and it never touches high-risk data unless you ask.

**"Will it delete my downloaded models?"**
> Not by default. Ollama and LM Studio are high risk and skipped by `clean`; only
> `--all` includes them, and `--dry-run` shows the plan first.

**"Is it safe?"**
> The allow-list is in src/adapters.ts - if a path is not a known cache or a project
> artifact inside a real project, devclean refuses it. Symlinks are never followed.
> --dry-run deletes nothing. MIT, no telemetry.

**"Why TypeScript and not Rust/Go?"**
> Zero install friction: `npx devclean` runs on any machine with Node 18, which every
> developer already has. A single static binary is on the roadmap if people want it.

**"Windows support?"**
> Yes - the first version was written on Windows, where the cache sprawl is worst.
> CI runs the suite on Windows, macOS and Linux.

**"Can it clean Docker / WSL / Xcode?"**
> Not yet. Docker images and WSL disks are not caches and deleting them is destructive,
> so they need a different design. Open an issue with your use case.