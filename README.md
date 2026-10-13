# SEIA Security Installation Services — Technical Operations Guide

Comprehensive technical documentation and operational reference for developers and maintainers of the SEIA Security Installation Services website and portfolio platform.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Implemented Features](#2-implemented-features)
3. [Technology Stack](#3-technology-stack)
4. [Repository Structure](#4-repository-structure)
5. [Local Development Environment Setup](#5-local-development-environment-setup)
6. [Environment Variables and Secrets Management](#6-environment-variables-and-secrets-management)
7. [Portfolio Architecture and Data Flow](#7-portfolio-architecture-and-data-flow)
8. [Cloudinary Naming Conventions and Hierarchy](#8-cloudinary-naming-conventions-and-hierarchy)
9. [Cloudinary Synchronization Operations](#9-cloudinary-synchronization-operations)
10. [Project Metadata Scaffolding Utility](#10-project-metadata-scaffolding-utility)
11. [Image Delivery and Asset Strategy](#11-image-delivery-and-asset-strategy)
12. [Testing and Validation Workflows](#12-testing-and-validation-workflows)
13. [GitHub Actions and GitHub Pages Deployment](#13-github-actions-and-github-pages-deployment)
14. [Security Posture and Defensive Controls](#14-security-posture-and-defensive-controls)
15. [Troubleshooting and Diagnostic Procedures](#15-troubleshooting-and-diagnostic-procedures)
16. [Contribution and Maintenance Workflow](#16-contribution-and-maintenance-workflow)
17. [Identified Operational Gaps and Future Roadmap](#17-identified-operational-gaps-and-future-roadmap)

---

## 1. Project Overview

### Purpose
SEIA Security Installation Services is a web platform showcasing commercial, residential, agricultural, and industrial perimeter security installations across the Philippines. The website presents technical case studies of electric security fences and automatic gate systems, while providing a direct channel for prospective clients to request on-site security assessments and inquiries.

### Audience
Property owners, facility managers, security consultants, general contractors, and agricultural estate operators in Metro Manila and Philippine provinces seeking engineered perimeter security solutions.

### Architecture & Philosophy
The project adheres to a **lightweight, dependency-minimal development philosophy**:
- **Zero Frontend Frameworks**: Built exclusively with standards-compliant HTML5, responsive CSS3, and native Vanilla JavaScript (ES Modules).
- **Static Production Hosting**: Deployed directly as a high-performance static website to GitHub Pages.
- **Build-Time Automation**: Media synchronization, schema validation, project scaffolding, and consistency verification execute as automated Node.js build-time utilities rather than runtime client dependencies.
- **Defensive Local Development**: A lightweight Node.js Express server (`server.js`) simulates production delivery with strict Content Security Policy (CSP), defensive HTTP headers, and path traversal protection.

---

## 2. Implemented Features

| Feature | Scope | Status | Details |
|:---|:---|:---:|:---|
| **Responsive Navigation** | Browser Runtime | IMPLEMENTED | Fixed semantic navbar with mobile slide-out drawer, keyboard focus trapping, and smooth anchor scrolling (`navbar.js`, `navbar.css`). |
| **Hero Presentation** | Browser Runtime | IMPLEMENTED | Direct call-to-action for on-site perimeter assessments (`hero.js`, `hero.css`). |
| **Interactive Portfolio Grid** | Browser Runtime | IMPLEMENTED | Dynamic project cards rendered from `portfolio-data.json` with lazy-loaded media (`portfolio.js`, `portfolio.css`). |
| **Category & Location Filtering** | Browser Runtime | IMPLEMENTED | Client-side dropdown filtering by system type (`Electric Fence`, `Automatic Gate System`, `Perimeter Security`) and location (`Metro Manila`, `Provincial`). |
| **Date Filtering & Chronological Sorting** | Browser Runtime | IMPLEMENTED | Filter by year and sort projects dynamically (`desc` newest first, `asc` oldest first) based on parsed date keys. |
| **Adaptive Pagination** | Browser Runtime | IMPLEMENTED | Viewport-aware page sizes (4 cards on mobile `<768px`, 6 cards on desktop `≥768px`) with dynamic pagination controls. |
| **Accessible Modal Gallery** | Browser Runtime | IMPLEMENTED | Dialog (`role="dialog"`, `aria-modal="true"`) with cyclical image carousel, keyboard navigation (`ArrowLeft`, `ArrowRight`, `Escape`), focus trapping, and background inertia. |
| **Touch Gesture Swipe Navigation** | Browser Runtime | IMPLEMENTED | Horizontal touch swipe navigation (`touchstart`, `touchmove`, `touchend`, `touchcancel`) on modal carousel with vertical scroll preservation and multi-touch rejection. |
| **Contact & Assessment Inquiries** | Browser Runtime | IMPLEMENTED | Client-validated inquiry form integrated with the Web3Forms submission API (`contact.js`, `contact.css`). |
| **Static HTML Fallback Cards** | SEO & No-JS | IMPLEMENTED | Pre-rendered semantic HTML cards in `portfolio.html` and `index.html` ensuring full search engine indexing and functionality without JavaScript. |
| **Cloudinary Media Sync** | Build Automation | IMPLEMENTED | Automated retrieval and grouping of Cloudinary assets into `portfolio-data.json` with pagination loop detection and unexpected data-loss guards (`scripts/sync-cloudinary-portfolio.mjs`). |
| **Hierarchy & Mapping Verification** | Build Automation | IMPLEMENTED | Automated validation of Cloudinary account folder structure, orphan asset detection, and case collision checks (`scripts/verify-cloudinary-mapping.mjs`). |
| **Project Metadata Scaffolding** | Build Automation | IMPLEMENTED | Draft generation utility that detects uncurated Cloudinary folders and scaffolds schema-compliant drafts in `portfolio-drafts.json` (`scripts/scaffold-new-project.mjs`). |
| **Dataset Schema Validation** | Build Automation | IMPLEMENTED | Strict type, URL security, duplicate ID, and collection health validator (`scripts/validate-portfolio-schema.mjs`). |
| **Fallback Drift Detection** | Build Automation | IMPLEMENTED | Validates parity between runtime JSON dataset and static HTML fallback cards (`scripts/validate-fallback-consistency.mjs`). |
| **Automated Deployment Pipeline** | CI/CD | IMPLEMENTED | GitHub Actions workflow executing secrets verification, sync, validation, test suite, and static deployment to GitHub Pages (`.github/workflows/deploy.yml`). |

---

## 3. Technology Stack

### Runtime & Browser Technologies
- **HTML5**: Semantic tags (`<article>`, `<dialog>`, `<nav>`, `<section>`, `<main>`), WCAG AA accessibility compliance, Schema.org JSON-LD structured data.
- **CSS3**: CSS Custom Properties (theming and spacing tokens), CSS Grid, Flexbox, media queries, `prefers-reduced-motion` compliance.
- **JavaScript**: Native ECMAScript Modules (ESM), DOM APIs, `WeakMap` data binding, touch event listeners, `fetch` API.
- **External Services**:
  - **Cloudinary CDN**: Media asset delivery via `https://res.cloudinary.com`.
  - **Web3Forms**: Contact form submission processing via `https://api.web3forms.com`.

### Build & Automation Tools
- **Node.js**: v22 LTS (ES Module mode configured via `"type": "module"` in `package.json`).
- **Package Management**: `npm` (manifest `package.json`, lockfile `bun.lock` also present in repository).
- **Express**: `^4.21.2` (used exclusively for local development and preview server).
- **Testing Engine**: Native Node.js Test Runner (`node:test`, `node:assert/strict`) — zero test dependencies.

### Deployment & Infrastructure
- **CI/CD Platform**: GitHub Actions (`ubuntu-latest`).
- **Static Hosting**: GitHub Pages.

---

## 4. Repository Structure

```text
.
├── .env.example                       # Template for local environment variables
├── .github/
│   └── workflows/
│       └── deploy.yml                 # GitHub Actions CI/CD deployment workflow
├── about.css                          # Styles for the About section
├── about.html                         # Static HTML partial for About section
├── about.js                           # Client-side component logic for About
├── app.js                             # Global app initialization and Back-to-Top FAB
├── bun.lock                           # Bun lockfile (present alongside package.json)
├── contact.css                        # Styles for Contact and assessment form
├── contact.html                       # Static HTML partial for Contact form
├── contact.js                         # Form validation and Web3Forms submission logic
├── docs/
│   └── SEIA-Full-Application-Audit.md # Comprehensive architectural audit report
├── footer.css                         # Styles for site footer
├── footer.html                        # Static HTML partial for footer
├── footer.js                          # Footer initialization logic
├── hero.css                           # Styles for Hero banner and CTA
├── hero.js                            # Hero initialization logic
├── images/                            # Local static project images and assets
│   ├── cover.jpg                      # Default fallback thumbnail
│   └── [project-folders]/             # Local photo sets organized by project
├── index.html                         # Primary HTML entrypoint (contains inlined sections)
├── metadata.json                      # AI Studio application metadata configuration
├── navbar.css                         # Styles for navigation header and mobile drawer
├── navbar.js                          # Navigation drawer and keyboard focus logic
├── package.json                       # Project manifest, npm scripts, and dependencies
├── portfolio.css                      # Styles for portfolio grid, filters, and modal
├── portfolio.html                     # Standalone portfolio partial and static fallback cards
├── portfolio.js                       # Portfolio hydration, filtering, sorting, and modal logic
├── portfolio-data.json                # Canonical runtime JSON dataset (31 projects, 221 images)
├── robots.txt                         # Search engine crawler directives
├── scripts/                           # Build-time Node.js automation utilities
│   ├── scaffold-new-project.mjs       # Scaffolds draft metadata for new Cloudinary folders
│   ├── sync-cloudinary-portfolio.mjs  # Synchronizes Cloudinary assets to portfolio-data.json
│   ├── validate-fallback-consistency.mjs # Validates JSON vs HTML fallback card parity
│   ├── validate-portfolio-schema.mjs  # Enforces schema and URL rules on portfolio-data.json
│   └── verify-cloudinary-mapping.mjs  # Validates Cloudinary account structure and orphans
├── server.js                          # Local Express server with defensive CSP and rate limits
├── sitemap.xml                        # XML sitemap for search engine indexing
├── style.css                          # Global design tokens, typography, and base resets
└── test/                              # Native Node.js automated test suites (78 tests)
    ├── csp-image-policy.test.mjs      # CSP header and image hosting origin tests
    ├── fallback-consistency.test.mjs  # HTML fallback parity tests
    ├── modal-touch-gestures.test.mjs  # Modal touch swipe gesture tests
    ├── scaffold-new-project.test.mjs  # Project metadata scaffolding tests
    ├── schema-validation.test.mjs     # Portfolio schema enforcement tests
    ├── sync-cloudinary-portfolio.test.mjs # Cloudinary sync unit tests
    ├── sync-validation.test.mjs       # Freshness, loss detection, and mock sync tests
    └── verify-cloudinary-mapping.test.mjs # Cloudinary hierarchy verification tests
```

---

## 5. Local Development Environment Setup

### Prerequisites
- **Node.js**: Version 22.x LTS (compatible with Node.js 18.x+).
- **Package Manager**: `npm` (version 9+ or bundled with Node.js).
- **Operating System**: Linux, macOS, or Windows (WSL recommended for Windows).

### Step-by-Step Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd static_seia
   ```

2. **Install project dependencies**:
   ```bash
   npm install
   ```
   *Note: Only `express` is installed; all build utilities, validators, and tests use native Node.js standard library modules.*

3. **Configure local environment variables (Optional)**:
   Copy the example environment file if you plan to test Cloudinary synchronization locally:
   ```bash
   cp .env.example .env
   ```
   *(Local preview does not require Cloudinary credentials unless running manual synchronization scripts).*

4. **Start the local development server**:
   ```bash
   npm run dev
   ```

5. **Access the application**:
   Open your browser to:
   ```text
   http://localhost:3000
   ```

6. **Stop the development server**:
   Press `Ctrl+C` in your terminal.

---

## 6. Environment Variables and Secrets Management

### Configuration Variables
The application defines environment variables in `.env.example`:

```env
PORT=3000
NODE_ENV=development

# Cloudinary Build-Time Portfolio Synchronization
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Variable Roles and Usage
- `PORT`: TCP port for the local Express server (defaults to `3000`).
- `NODE_ENV`: Execution environment (`development` or `production`). Enables static asset caching when set to `production`.
- `CLOUDINARY_CLOUD_NAME`: Cloudinary cloud identifier. Required for `sync:portfolio`, `verify:cloudinary`, and `scaffold:portfolio`.
- `CLOUDINARY_API_KEY`: Cloudinary API key for Basic Authentication.
- `CLOUDINARY_API_SECRET`: Cloudinary API secret for Basic Authentication. **Privileged build-time secret; must never be exposed to browser code.**

### Local Credential Hygiene
- **Never commit `.env` files**: Keep actual credentials strictly in untracked local environments.
- **Operational Gap Identified**: The repository currently lacks a `.gitignore` file. Developers must manually ensure `.env` and `.env.local` files are never staged. *(See [Section 17](#17-identified-operational-gaps-and-future-roadmap) for recommended remediation).*
- **Confirm presence safely**: Verify environment variables exist without printing secrets:
  ```bash
  [ -n "$CLOUDINARY_API_SECRET" ] && echo "Secret is configured" || echo "Secret is missing"
  ```

### GitHub Actions Secrets
In CI/CD, the following repository secrets must be configured under **Settings > Secrets and variables > Actions**:
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

If any secret is missing during a workflow run, the step `Validate Cloudinary Credentials` halts the deployment immediately with exit code `1`.

---

## 7. Portfolio Architecture and Data Flow

### Architecture Pipeline

```text
┌────────────────────────────────────────────────────────┐
│ Cloudinary Media Library (Folder: seia/<project-id>/)   │
└───────────────────────────┬────────────────────────────┘
                            │
                            │ Build-Time Synchronization (Node.js)
                            ▼
┌────────────────────────────────────────────────────────┐
│ scripts/sync-cloudinary-portfolio.mjs                  │
│ - Pages through Admin API (loop detection)             │
│ - Groups assets by folder hierarchy                    │
│ - Preserves manual curation                            │
│ - Verifies data freshness (loss prevention)            │
│ - Enforces schema validation                           │
│ - Executes atomic write & rename                       │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ portfolio-data.json (Canonical Runtime Dataset)        │
│ 31 Projects | 221 Media Items                          │
└───────────────────────────┬────────────────────────────┘
                            │
                            │ GitHub Actions Deployment Artifact
                            ▼
┌────────────────────────────────────────────────────────┐
│ GitHub Pages Static Delivery (HTTPS)                   │
└───────────────────────────┬────────────────────────────┘
                            │
                            │ Browser fetch('portfolio-data.json')
                            ▼
┌────────────────────────────────────────────────────────┐
│ portfolio.js (Runtime Client Hydration)                │
│ ├── createCard() & renderCardsIntoGrid()               │
│ ├── Filtering (Category & Location)                    │
│ ├── Sorting (Date key asc/desc)                        │
│ ├── Adaptive Pagination (Mobile 4 / Desktop 6)         │
│ └── Modal Gallery Dialog                               │
│     ├── Keyboard trap & cyclical navigation            │
│     └── Touch swipe gesture navigation (evaluateSwipe) │
└────────────────────────────────────────────────────────┘
```

### Authoritative Source of Truth
1. **`portfolio-data.json`**: The **canonical data source** for runtime rendering. All dynamic cards, filters, sort orders, and modal gallery images read from this file.
2. **`portfolio.html` / `index.html`**: The **static fallback**. Contains 4 static fallback cards representing key projects. Used for initial server rendering, search engine crawlers, and users with JavaScript disabled.
3. **Cloudinary Assets**: The **upstream media source**. Cloudinary hosts high-resolution images; metadata (titles, descriptions, categories) is maintained inside `portfolio-data.json`.

---

## 8. Cloudinary Naming Conventions and Hierarchy

The synchronization script (`scripts/sync-cloudinary-portfolio.mjs`) and verification utility (`scripts/verify-cloudinary-mapping.mjs`) expect Cloudinary assets to follow an explicit hierarchical convention:

### Folder Hierarchy Convention

```text
seia/
├── <project-id-1>/
│   ├── overview.jpg
│   ├── detail-01.jpg
│   └── detail-02.jpg
└── <project-id-2>/
    ├── main-fence.jpg
    └── energizer-box.jpg
```

### Convention Rules
1. **Root Prefix**: All portfolio media must reside under the `seia/` folder prefix.
2. **Project Folder (`<project-id>`)**: Each project must have its own dedicated subfolder directly under `seia/`.
   - The subfolder name becomes the `projectId` during synchronization (e.g., `seia/J.Molina street marikina city082826/image.jpg` yields project ID `J.Molina street marikina city082826`).
3. **Asset Placement**: Images placed directly in `seia/` without a project subfolder (e.g., `seia/standalone.jpg`) are classified as **Excluded Standalone Assets** and will not be assigned to any project.
4. **Supported Resource Types**: Only `image` resources are eligible. Video and raw assets are flagged as non-portfolio items.
5. **Image Ordering**: Images within each project folder are sorted chronologically by upload timestamp (`created_at`), falling back to alphabetical sorting by `public_id`. The first image in the sequence serves as the default project thumbnail (`thumbUrl`).

---

## 9. Cloudinary Synchronization Operations

### Synchronization Scripts
The synchronization engine supports both write and dry-run execution:

```bash
# Execute dry-run synchronization (queries API, verifies grouping, does NOT write to disk)
npm run sync:portfolio:dry

# Execute live synchronization (updates portfolio-data.json atomically)
npm run sync:portfolio
```

### Hierarchy & Mapping Verification
Verify the remote Cloudinary folder structure and inspect asset accounting independently of data synchronization:

```bash
# Verify folder hierarchy, orphans, case collisions, and metadata coverage
npm run verify:cloudinary
```

### Safety and Integrity Guarantees
- **Pagination Completeness**: Follows `next_cursor` tokens until exhausting the inventory. Detects and halts on cyclical cursor loops.
- **Unexpected Data Loss Protection**: `detectUnexpectedDataLoss()` audits newly fetched assets against previously published Cloudinary images. If any previously published Cloudinary asset is missing from the remote inventory, the script throws a fatal exception, preventing the deployment of a corrupted or incomplete portfolio.
- **Metadata Preservation**: Synchronization updates the `images` array and `thumbUrl` but strictly preserves manually curated metadata (`title`, `desc`, `category`, `date`, `loc`, `tags`).
- **Atomic File Writing**: `writeDatasetSafely()` writes the updated JSON to a temporary file (`.tmp`), validates that the file parses correctly, and performs an atomic rename, ensuring the last-known-good dataset is never corrupted by mid-stream interruptions.

---

## 10. Project Metadata Scaffolding Utility

When new project folders are uploaded to Cloudinary, they initially lack manually curated metadata (title, category, description). The scaffolding utility discovers these pending folders and scaffolds schema-compliant draft entries.

### CLI Usage

```bash
# Preview newly discovered Cloudinary folders and draft metadata (dry-run)
npm run scaffold:portfolio

# Write scaffolded drafts to portfolio-drafts.json
npm run scaffold:portfolio:write

# Scaffold with custom category override
node scripts/scaffold-new-project.mjs --write --category="Automatic Gate System"
```

### Operational Rules
1. **Draft Isolation**: Scaffolding **never modifies `portfolio-data.json` directly**. It writes exclusively to `portfolio-drafts.json`.
2. **Title Normalization**: Converts raw folder slugs into human-readable titles while respecting known acronyms (`QC`, `CCTV`, `GSM`, `LED`, `SEIA`) and title-casing rules.
3. **Location Heuristics**: Inspects folder names for Philippine municipal keywords (`marikina`, `quezon city`, `pasig`, etc.) to automatically assign `loc: "metro"` or `loc: "prov"`.
4. **Curation Workflow**:
   - Review drafts in `portfolio-drafts.json`.
   - Edit the generated title, description, and tags.
   - Manually copy approved project entries into `portfolio-data.json`.
   - Run `npm run validate:schema` to confirm validity.

---

## 11. Image Delivery and Asset Strategy

The application employs a **hybrid image-hosting architecture**:

1. **Remote Cloudinary CDN**:
   - High-resolution portfolio photographs delivered via `https://res.cloudinary.com`.
   - Fully compatible with the application's Content Security Policy (`img-src 'self' data: https://res.cloudinary.com;`).
2. **Local Static Assets**:
   - Core branding, cover fallback (`images/cover.jpg`), and legacy project photos stored in the `/images/` directory.
   - Served directly with `'self'` origin.
3. **Frontend Performance Optimizations**:
   - All dynamic and fallback images declare `loading="lazy"` and `decoding="async"` to prevent render-blocking.
   - Fixed aspect ratios in CSS (`aspect-ratio: 4/3` on `.pf-card__media`) eliminate cumulative layout shift (CLS).
   - Container letterboxing (`object-fit: contain; background: var(--media-letterbox);`) preserves photo clarity across vertical and horizontal shots.

---

## 12. Testing and Validation Workflows

The repository includes a comprehensive, dependency-free test suite utilizing Node.js's native test runner (`node:test`).

### Executing Tests

```bash
# Run all automated unit and integration tests (78 tests)
npm test

# Run schema validation on portfolio-data.json
npm run validate:schema

# Run HTML fallback card consistency check
npm run validate:fallback

# Run JavaScript syntax check on server.js
npm run lint
```

### Test Suite Breakdown

| Test File | Tests | Validated Behavior |
|:---|:---:|:---|
| `test/schema-validation.test.mjs` | 13 | Required fields, array structure, unique IDs, HTTPS image URLs, collection health. |
| `test/sync-validation.test.mjs` | 27 | Pagination loops, duplicate asset handling, data loss detection, atomic file writing, idempotency. |
| `test/verify-cloudinary-mapping.test.mjs` | 9 | Folder hierarchy compliance, orphan asset detection, case collisions, report formatting. |
| `test/scaffold-new-project.test.mjs` | 12 | Draft scaffolding, title casing, location heuristics, write isolation in `portfolio-drafts.json`. |
| `test/modal-touch-gestures.test.mjs` | 9 | Touch swipe gesture threshold, directional dominance, vertical scroll preservation, CSS `touch-action`. |
| `test/csp-image-policy.test.mjs` | 4 | Express CSP headers, HTML meta CSP alignment, absence of insecure wildcards. |
| `test/fallback-consistency.test.mjs` | 4 | Parity between `portfolio-data.json` and static HTML fallback cards in `portfolio.html`. |
| `test/component-stitching.test.mjs` | 12 | Marker validation, fragment formatting, duplicate ID prevention, idempotency, dry-run mode, and runtime duplication guards. |

---

## 13. GitHub Actions and GitHub Pages Deployment

### Workflow Pipeline (`.github/workflows/deploy.yml`)

Deployments trigger automatically on `push` to the `main` branch or via manual execution (`workflow_dispatch`).

```text
Authorized Push to main / Manual Dispatch
                  │
                  ▼
          Checkout Repository (actions/checkout@v4)
                  │
                  ▼
          Setup Node.js 22 (actions/setup-node@v4)
                  │
                  ▼
          Install Dependencies (npm ci || npm install)
                  │
                  ▼
          Validate Cloudinary Secrets (Fail-Safe Guard)
                  │
                  ▼
          Verify Cloudinary Mapping (npm run verify:cloudinary)
                  │
                  ▼
          Sync Portfolio Data (npm run sync:portfolio)
                  │
                  ▼
          Stitch Component Partials (npm run stitch:components)
                  │
                  ▼
          Validate Dataset Schema (npm run validate:schema)
                  │
                  ▼
          Run Automated Test Suite (npm test - 90 tests)
                  │
                  ▼
          Validate Fallback Parity (npm run validate:fallback)
                  │
                  ▼
          Build Site (npm run build)
                  │
                  ▼
          Upload Static Artifact (actions/upload-pages-artifact@v3)
                  │
                  ▼
          Deploy to GitHub Pages (actions/deploy-pages@v4)
```

### Deployment Safety & Guarantees
- **Strict Blocking Pipeline**: If credentials are missing, if Cloudinary synchronization fails, if schema validation fails, if any unit test fails, or if fallback drift is detected, the workflow **terminates immediately**. No broken artifact is ever deployed.
- **Production Server Distinction**: GitHub Pages serves static files directly and does not execute `server.js` at runtime. Runtime defenses (rate limiting, dynamic headers) apply to local preview environments.

---

## 14. Security Posture and Defensive Controls

1. **Content Security Policy (CSP)**:
   - Configured in both `server.js` and `index.html`.
   - `default-src 'self'`: Restricts origin defaults.
   - `img-src 'self' data: https://res.cloudinary.com`: Strictly limits media to local files, data URIs, and the verified Cloudinary CDN origin. Wildcard `*` or general `https:` origins are prohibited.
   - `connect-src 'self' https://api.web3forms.com`: Restricts client API connections exclusively to the form processing endpoint.
2. **Server-Side Hardening (`server.js`)**:
   - `x-powered-by` header disabled.
   - Sensitive file access blocked: Requests for `.env`, `package.json`, lockfiles, server code, and dotfiles return 404.
   - In-memory sliding-window rate limiter: Enforces a cap of 60 requests/minute per IP with a hard memory cap of 5,000 entries to prevent memory exhaustion attacks.
   - JSON body parsing strictly capped at `10kb`.
3. **DOM & Client-Side Safety**:
   - Dynamic portfolio rendering creates DOM nodes via `document.createElement()` and `textContent`. No raw unescaped HTML strings are injected from untrusted data.
   - Modal dialog traps keyboard focus and marks background sections as `inert` and `aria-hidden="true"`.

---

## 15. Troubleshooting and Diagnostic Procedures

### Common Issues and Resolutions

#### 1. Port Conflict on Local Dev (`EADDRINUSE: address already in use :::3000`)
- **Symptom**: `npm run dev` fails with `Error: listen EADDRINUSE: address already in use :::3000`.
- **Cause**: Another process or background server is bound to port 3000.
- **Resolution**: Identify and terminate the listening process or specify an alternative port:
  ```bash
  # Check process using port 3000
  lsof -i :3000
  # Or start server on an alternative port
  PORT=3001 npm run dev
  ```

#### 2. Cloudinary Sync Fails (`Missing required Cloudinary environment variables`)
- **Symptom**: `npm run sync:portfolio` throws `Missing required Cloudinary environment variables: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET`.
- **Cause**: Shell environment variables are not exported or `.env` is missing.
- **Resolution**: Populate `.env` from `.env.example` and source it in your shell:
  ```bash
  export $(grep -v '^#' .env | xargs)
  npm run sync:portfolio:dry
  ```

#### 3. Fallback Parity Failure (`Missing In JSON: 1`)
- **Symptom**: `npm run validate:fallback` fails reporting a project missing in `portfolio-data.json`.
- **Cause**: An HTML fallback card exists in `portfolio.html` that has not yet been registered or migrated into `portfolio-data.json`.
- **Resolution**: Use the configured `--ignore` flag in `package.json` for known legacy migration cards, or register the project in `portfolio-data.json`:
  ```bash
  node scripts/validate-fallback-consistency.mjs "--ignore=bag-bag-novaliches-qc-(4-lines)"
  ```

#### 4. Images Blocked in Browser by CSP
- **Symptom**: Portfolio image displays as a broken link; browser console displays `Refused to load the image ... because it violates the following Content Security Policy directive`.
- **Cause**: The image URL originates from an unapproved CDN or domain not listed in `img-src`.
- **Resolution**: Ensure all external images are hosted on `https://res.cloudinary.com` or stored locally under `images/`.

---

## 16. Contribution and Maintenance Workflow

To maintain stability, security, and accessibility across updates:

1. **Make Focused Changes**: Modify only the relevant component (`portfolio.js`, `style.css`, etc.).
2. **Maintain Zero Frontend Dependencies**: Do not introduce client-side frameworks, runtime bundle tools, or CSS libraries.
3. **Execute Pre-Commit Validation**:
   ```bash
   npm test
   npm run validate:schema
   npm run validate:fallback
   npm run lint
   ```
4. **Inspect Git Diff**: Ensure no temporary test files, credentials, or unintended modifications are staged.
5. **Push to `main`**: Allow the GitHub Actions workflow to run the full verification pipeline before deploying to GitHub Pages.

---

## 17. Identified Operational Gaps and Future Roadmap

During the technical audit of the codebase, the following operational gaps were identified for future enhancement:

1. **Add Root `.gitignore` File (High Operational Priority)**:
   - *Current State*: The repository has no `.gitignore` file.
   - *Risk*: Risk of accidentally staging local `.env` files or temporary build artifacts.
   - *Recommendation*: Add `.gitignore` containing:
     ```gitignore
     node_modules/
     .env
     .env.local
     portfolio-drafts.json
     *.tmp
     .DS_Store
     ```

2. **Automated WebP/AVIF Image Optimization (P3 Performance)**:
   - *Current State*: Local images under `images/` are legacy JPEG format (`.jpg`).
   - *Recommendation*: Implement an automated build-time image conversion utility to produce WebP/AVIF variants with fallback support.

3. **Automated HTML Partial Stitching (P3 Maintainability — VERIFIED IMPLEMENTED)**:
   - *Status*: Implemented and verified via `scripts/stitch-components.mjs` and `test/component-stitching.test.mjs`.
   - *Capability*: Compiles `about.html`, `portfolio.html`, `contact.html`, and `footer.html` directly into designated regions in `index.html` with full marker validation, duplicate ID prevention, and 100% idempotency.
   - *Commands*: `npm run stitch:components` (write) and `npm run stitch:components:dry` (preview). Run automatically in CI deployment before testing and artifact packaging.
