# Sahayogi Developer: how to use it, and what every option means

Written for the person who runs products through Stages 0 to 4. No technical knowledge needed.
Section 6 says what has been tried on screen and what has not.

## 1. What this tool is, in five lines
1. You have ideas and products. Each one moves through five stages before development starts.
2. At each stage the tool collects the facts, writes them up as readable documents, and checks them before you move on.
3. You only supply what nobody else knows: decisions, customer facts, constraints, numbers. An assistant reads your files and drafts the rest. You approve or reject.
4. Each stage ends with a sign-off. It can only be given when the required facts and documents exist. The "What is blocking me" screen lists what is still needed, in plain words.
5. When Stage 4 is done, the approved stories go to the developer tool.

## 2. The five stages
| Stage | Name | The question it answers | Main documents |
|---|---|---|---|
| 0 | Intake / Discovery | What is this and why now? | Intake document, stakeholders, evidence, constraints, open questions, scope boundary |
| 1 | Product and market analysis | Is the problem real and where do we stand? | Market analysis, competitor analysis, customers, problems, market risks |
| 2 | Product definition / scope | What exactly will we build first? | Product definition, scope statement, capability map, priorities, success metrics, out-of-scope list |
| 3 | Requirements | What must it do, precisely? | Requirements, user stories, business rules, acceptance criteria, quality targets, integrations, traceability |
| 4 | User and business flows | How do people and processes move through it? | Journeys, process maps, workflows, state maps, exception flows |

## 3. The journey on screen
1. **Portfolio**: every product and idea, its stage, its owner, its next step, what is blocking it. Start here. Opening a product shows its Product document.
   **Product document** (the home of every product): one page that answers where the product stands, what is blocking this stage, who we are waiting for, and what changed lately; and below that the WHOLE documentation as one readable document with a contents list grouped by stage. Documents of stages not reached yet are folded into one line ("Show them now" opens them); a document that already holds something is never folded. A part that is missing is marked where it belongs, with a button that goes to the short question that fixes it. The buttons "+ Pricing plan, + Feature, + Rule, + Question" add to the document directly. Print it or download it as one file. No need to open 30 separate pages: **Documents as cards**, **Quick answers**, the competitor workspace and the rest are there when you want the detail, under More or in the menu.
   **Product sheet**: one page of answers for a product. Pricing plans (add and change them here), the feature list with requirement and story counts, competitors and their prices side by side, rules and legal duties, quality targets and open questions (answer them here). It shows only what was entered; if something is missing, it was never recorded. Print or save it as a PDF from the top right.
   **Search**: the box at the top searches every product at once, for plans, features, rules, competitors, questions and evidence, by name, by a number such as a price, or by the kind of record (for example "pricing plans"). Each result opens the record. Text inside uploaded files is not searched yet.
2. **New idea or product**: four questions only (see section 4).
   **Existing system**: for a product that replaces or extends something already running (the menu item appears only then). One card per function of the old system: how it works today, what is wrong, your decision (keep, fix, drop, add, or confirm first), and how it should work in the new system. A second person confirms how the old function really works; the person who wrote it cannot. A function you keep, fix or add becomes a feature in one click, linked back to the function it replaces. Add a file as proof to any function.
   **Signing in**: on the company server (see docs/COMPANY_SERVER.md) everyone signs in with their own email and password, and the name shown on every change and approval is the signed-in person. On a single computer there is no sign-in and the Acting-as list is used.
   **Send to developer tool**: on the Hand over screen, after a package is created, this sends it to the developer tool and shows Delivered with a receipt, or the reason it did not work (see docs/HANDOFF_RECEIVER.md).
3. **Product pages**: a journey bar at the top shows the stage you are in, and a Next step line with a Continue button names the one thing to do now.
4. **Work**: short question sessions, one task at a time, about 5 to 50 minutes each. Each question says why it is asked and gives an example.
5. **Files**: upload a PPT, PDF, Word or Excel file. Open it in the viewer. The assistant proposes what it found, each with the exact slide, page or cell. You accept or reject in the review inbox.
6. **Documents**: 30 small cards with a status dot and a percentage ring. Click one to read it. "N things missing" opens a list with a link to add each one. Print or download from the More menu.
7. **Reports**: three numbers and up to three lines that need attention come first. The funnel, time in stage, blockers, documents per product, data freshness and human time sit in sections that start closed. Print, CSV and HTML are in one menu.
8. **Idea card**: the first step of every product. One screen with five short answers (name, the idea in one line, who it is for, why now, who asked). It is done when all five are filled in, and you can open it again to change them.
9. **Who you need**: a plain page listing, stage by stage, every person the process needs (the sponsor, Legal, a second person to check facts, customers and dealers for quotes, approvers of documents and stories), what is needed from each, and where it stands: Not asked yet, Asked, Waiting, Done. Rows that use an approval link have Copy link, Email and WhatsApp buttons. "Send everything for this stage" creates every request that can be asked now and lists all the links together.
10. **Flows**: from Stage 4 you write each flow in plain words: the steps, who does each one, what happens next, and for any step "What if this fails?" with one sentence saying how you will check that it fails safely. Open it from Journey, or from More, Edit the flows.
11. **Something wrong here?**: a small button at the bottom right of every screen (except an approver's page). Write a few words, tick what kind of problem it is if you like, and press Save note. The note is saved with the screen you were on, the product, the time, who you were acting as, the window width and the number of words on screen. The page More, Notes you left lists them with a Done tick.

## 4. Field guide: every option you asked about, and what happens to it
I took these from the tool's internal data model and showed them raw in a generic form. That was a mistake. A person creating a product should not see most of them.

| Field | What it means | What you will see in the rebuilt screens |
|---|---|---|
| Name | The product's name | Asked |
| One-line idea | What it is in one sentence | Asked |
| Who asked / owner | The person responsible | Asked (defaults to you) |
| Mode (greenfield, extend, replace) | Is this brand new, an extension of something that exists, or a replacement for an existing system? Replacement and extension switch on the "document how it works today" steps | Asked as one yes/no: "Is there an existing system or product to start from?" |
| How thorough (Light, Standard, Thorough) | How much proof each stage sign-off asks for. Light is the minimum, Standard is the usual balance, Thorough asks for everything. More thorough means more checks and more of your time | Default Standard. Changeable in Edit details on the product page, with the time cost of each level |
| Current stage | Which stage the product is in | Never editable. It is the earliest stage whose sign-off has not passed yet |
| Default currency | The currency used for prices and budgets | Set once for the company (Indian rupees by default), not per product |
| Sponsor | The person who owns the budget and signs scope decisions | Asked inside the Stage 0 session, where it matters |
| Track (quick or full) | Quick = smaller products with relaxed checks. Full = everything | Hidden. The tool suggests quick when the size is small |
| Risk class (standard or high) | High means extra legal and security checks | Hidden. Asked as "Does this handle personal data, payments or safety?" |
| Status, origin, verified by, proposed by | System bookkeeping: who created a record and who checked it | Never shown as inputs |

Rule I am holding myself to: if a field cannot be explained in one plain sentence to the person filling it in, it is not shown.

## 5. Words you will meet
- **Stage sign-off**: the decision that ends a stage. The "What is blocking me" screen lists what is done and what is still needed. A person cannot approve their own work: the approver is someone else, picked from the product's people.
- **Must-answer question**: an open question that holds up a sign-off until you answer it, assume an answer (with an owner and a date to re-check), or set it aside with an approval.
- **Exception (waiver)**: a recorded, time-limited decision to go ahead although something is missing. It has a named approver, picked from the product's people, and an end date.
- **Evidence**: a source for a fact, such as a document, interview or web page.
- **Pointer**: a link from a fact to the exact place in a document that supports it, for example slide 7 of a competitor's deck.
- **Review inbox**: where the assistant's proposals wait for you. Nothing it proposes counts until you accept it. When two files give different numbers for the same price, the card shows both quotes.
- **Checking a fact**: a different person from the one who created or asked for it opens the source and writes down where they checked. The note is shown on the fact afterwards.
- **Needs a second look**: an item that depends on something that was edited after approval. It needs a quick re-check.
- **Handoff**: sending approved stories, with everything the developers need, to the developer tool.

## 6. What exists today and what does not
Checked on 2026-10-10 by running the app and loading every screen in a browser. Each builder also clicked through its own screens.

| Area | State |
|---|---|
| Portfolio of products and ideas, new product (four questions), idea list, promote an idea | Redesigned as calm cards. Created a product and promoted an idea through the screens |
| Product page: five-stage journey, next actions, document status, edit details, park and archive | Built and exercised |
| Work on it: short question sessions, skip with a reason, answer from a document | Built and exercised (a complete session through to its final summary was not tried) |
| Documents: 30 cards, reader, submit for review, ask a second person to approve, dossier, download | Redesigned. Opened, submitted and sent for approval; downloads saved. Print preview not opened. Waiver path not re-tried |
| Files: upload, readable view of PPT, Word, Excel, CSV, PDF and images | Built and exercised |
| Select text, link it to a fact (a pointer), see highlights | Built and exercised |
| Review inbox: accept, reject, edit first, accept all high-confidence | Redesigned. Accept and reject (with a reason) re-tried. Edit first and the bulk button were not re-tried |
| Competitors: add, profile, prices, capabilities, notes, files, compare, CSV | Built and exercised (Remove actions not tried) |
| Sign-in for a shared company server: accounts, passwords, sessions, who-did-what by account | Built and exercised in a real browser on a blank install (set up, add a person, sign out, wrong password, sign in). Plain http; not Microsoft sign-in |
| Existing-system mode: function by function, second-person confirmation, one click to a linked feature | Built and exercised in a real browser |
| Send to developer tool: package sent, receipt shown, failures named, safe to repeat | Built and exercised against the reference receiver included here. Not tested against the real Sahayogi One |
| Reports: portfolio and per-product, print, CSV, HTML | Redesigned. CSV and HTML downloads clicked and saved. Print opens every section first; print preview not opened |
| Stage sign-offs ("What is blocking me") | Main menu. Plain list of what is still needed per stage, with the engine's own table under "Details for experts" |
| Expert pages (stage health, how records link up, flows, handoff, history) | Kept under "For experts"; all load without errors |
| Assistant | Three modes. Live AI needs an API key you set yourself and has only been tested with a fake connection. In live mode every run shows an estimate in rupees and asks you to confirm, keeps a usage log and honours a monthly limit. Offline demo mode and simple pattern matching run without a network and show no cost |
| Dark theme and widths under 1024 pixels | Checked screen by screen in round 4: each redesigned screen was opened in dark and at 800 pixels wide, and text under the contrast limit was fixed |
| Real login, several users, PDF export of reports, notifications | Not built |

Known rough edges: the expert pages rewrite the engine's wording on screen, so a few phrases there can still read oddly; the competitor profile Remove buttons only retire records; text selections cannot span two slides or table cells.
