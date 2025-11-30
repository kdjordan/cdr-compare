# CDR Reconciliation Tool - Product Requirements Document

## Project Overview

A web-based tool enabling VoIP carriers to identify billing discrepancies between their internal CDRs (Call Detail Records) and provider/customer CDRs. Users upload two sets of records, the system matches them deterministically, and returns a polished report highlighting mismatches, missing records, and billing differences.

**Timeline:** Demo-ready by December 8, 2025  
**Purpose:** Internal demo for executive stakeholders and AI task force  
**Hosting:** Hetzner CPX32 server with Coolify (already configured)  
**Live URL:** http://49.13.124.226 (placeholder currently deployed)

---

## Technical Stack

### Core Framework
- **Next.js 14** (App Router)
- **React 18**
- **TypeScript**

### Styling & UI
- **Tailwind CSS**
- **shadcn/ui** - Component library
- **Lucide React** - Icons
- **Framer Motion** - Animations

### Data Processing
- **Papa Parse** - CSV parsing
- **SheetJS (xlsx)** - Excel file parsing
- **better-sqlite3** - SQLite for ephemeral matching database
- **JSZip** - ZIP file extraction

### PDF/Reports (Nice-to-have)
- **@react-pdf/renderer** - PDF generation
- **Recharts** - Charts for visual reports

---

## Project Setup Instructions

### 1. Initialize Next.js Project

```bash
npx create-next-app@latest cdr-reconciliation --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd cdr-reconciliation
```

### 2. Install Dependencies

```bash
# UI Components
npx shadcn@latest init
npx shadcn@latest add button card input label select table tabs progress alert dialog dropdown-menu toast

# File Processing
npm install papaparse xlsx jszip better-sqlite3
npm install -D @types/papaparse @types/better-sqlite3

# Animations
npm install framer-motion

# Icons
npm install lucide-react

# PDF & Charts (optional - add later if time permits)
npm install @react-pdf/renderer recharts
```

### 3. Configure shadcn/ui

When prompted during `shadcn init`:
- Style: Default
- Base color: Slate (we'll customize)
- CSS variables: Yes

### 4. Project Structure

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                 # Landing/upload page
│   ├── globals.css
│   └── api/
│       ├── upload/
│       │   └── route.ts         # Handle file uploads
│       ├── process/
│       │   └── route.ts         # Run reconciliation
│       └── export/
│           └── route.ts         # Generate downloadable report
├── components/
│   ├── ui/                      # shadcn components
│   ├── upload/
│   │   ├── FileDropzone.tsx     # Drag-drop upload
│   │   ├── FilePreview.tsx      # Show uploaded file info
│   │   └── UploadCard.tsx       # Container for each file
│   ├── mapping/
│   │   ├── ColumnMapper.tsx     # Map columns to schema
│   │   ├── SampleDataTable.tsx  # Preview of file data
│   │   └── FieldSelector.tsx    # Dropdown for each field
│   ├── processing/
│   │   └── ProcessingStatus.tsx # Progress indicator
│   ├── results/
│   │   ├── ResultsDashboard.tsx # Main results view
│   │   ├── SummaryCards.tsx     # Key metrics
│   │   ├── DiscrepancyTable.tsx # Detailed differences
│   │   └── ExportButton.tsx     # Download options
│   └── layout/
│       ├── Header.tsx
│       └── Footer.tsx
├── lib/
│   ├── parser/
│   │   ├── csv.ts               # CSV parsing logic
│   │   ├── xlsx.ts              # Excel parsing logic
│   │   └── zip.ts               # ZIP extraction
│   ├── reconciliation/
│   │   ├── normalize.ts         # Phone number normalization
│   │   ├── matcher.ts           # Core matching algorithm
│   │   └── database.ts          # SQLite operations
│   └── utils.ts                 # Shared utilities
├── types/
│   └── index.ts                 # TypeScript interfaces
└── hooks/
    ├── useFileUpload.ts
    └── useReconciliation.ts
```

---

## Design Requirements

### Aesthetic Direction

**Tone:** Professional, refined, data-focused with subtle sophistication. Think Bloomberg terminal meets modern SaaS - serious tool for serious work, but with polish that signals competence.

**Key Design Principles:**
- **Dark theme primary** - easier on eyes for data-heavy work, signals technical sophistication
- **High contrast data visualization** - discrepancies should pop
- **Generous whitespace** - let the data breathe
- **Subtle animations** - smooth transitions that feel premium, not flashy
- **Clear visual hierarchy** - users should immediately know what matters

### Typography

Avoid generic fonts. Suggested pairing:
- **Headings:** JetBrains Mono, IBM Plex Mono, or Space Grotesk
- **Body:** Inter is acceptable here given data-density needs, or use IBM Plex Sans
- **Data/Numbers:** Tabular figures, monospace for alignment in tables

Add to `globals.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
```

### Color Palette

```css
:root {
  /* Dark theme base */
  --background: 222 47% 6%;      /* Near black with blue tint */
  --foreground: 210 40% 96%;     /* Off-white */
  
  /* Card/Surface */
  --card: 222 47% 9%;
  --card-foreground: 210 40% 96%;
  
  /* Accent - Use sparingly for CTAs and highlights */
  --accent: 142 76% 46%;         /* Vibrant green - success/money theme */
  --accent-foreground: 0 0% 100%;
  
  /* Semantic colors for discrepancies */
  --missing: 0 84% 60%;          /* Red - missing records */
  --mismatch: 38 92% 50%;        /* Amber - duration/rate mismatch */
  --matched: 142 76% 46%;        /* Green - matched correctly */
  
  /* Muted elements */
  --muted: 217 33% 17%;
  --muted-foreground: 215 20% 55%;
  
  /* Borders */
  --border: 217 33% 17%;
}
```

### Visual Effects

- Subtle gradient meshes on hero/landing section
- Soft glow effects on primary buttons
- Smooth progress animations during processing
- Staggered fade-in for results
- Hover states on table rows to highlight data

### Component Styling Notes

**Cards:** Subtle border, slight background differentiation, rounded-lg  
**Buttons:** Primary uses accent color with subtle glow on hover  
**Tables:** Alternating row colors, sticky headers, horizontal scroll on mobile  
**Dropzones:** Dashed border that animates on drag-over, clear visual feedback  

---

## User Flow

### Screen 1: Landing / Upload

**Purpose:** Explain the tool, accept two file uploads

**Elements:**
- Hero section with clear value proposition
- Two upload zones side-by-side:
  - Left: "Your CDRs" (internal records)
  - Right: "Provider CDRs" (counterparty records)
- Accepted formats badge: ZIP, CSV, XLSX
- "Next" button (disabled until both files uploaded)

**Interactions:**
- Drag-drop or click to upload
- File validation feedback (size, format)
- Preview: filename, size, estimated row count

### Screen 2: Column Mapping

**Purpose:** Map uploaded file columns to canonical schema

**Elements:**
- Two-panel layout (Your CDRs | Provider CDRs)
- Sample data preview (first 5 rows)
- Dropdown for each canonical field:
  - A-Number (Calling party)
  - B-Number (Called party)  
  - Seize Time
  - Answer Time
  - End Time
  - Billed Duration
  - Rate
- Auto-detect suggestions based on common header names
- Validation: required fields highlighted if unmapped
- "Process" button

**Auto-detect Logic:**
```typescript
const headerMappings: Record<string, string[]> = {
  a_number: ['ani', 'a_number', 'calling', 'from', 'origination', 'caller'],
  b_number: ['dnis', 'b_number', 'called', 'to', 'destination', 'dialed'],
  seize_time: ['seize', 'start', 'attempt', 'origination_time', 'call_start'],
  answer_time: ['answer', 'connect', 'answer_time'],
  end_time: ['end', 'disconnect', 'release', 'call_end', 'hangup'],
  billed_duration: ['duration', 'billed', 'seconds', 'bill_sec', 'billsec'],
  rate: ['rate', 'price', 'cost', 'per_min']
};
```

### Screen 3: Processing

**Purpose:** Visual feedback during reconciliation

**Elements:**
- Progress bar with stages:
  1. Parsing File A...
  2. Parsing File B...
  3. Normalizing records...
  4. Running comparison...
  5. Generating report...
- Estimated time remaining (optional)
- Cancel button

### Screen 4: Results Dashboard

**Purpose:** Display reconciliation findings

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  Summary Cards (4 across)                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Total A  │ │ Total B  │ │ Matched  │ │ Diff $   │   │
│  │ 847,293  │ │ 851,102  │ │ 842,156  │ │ $4,293   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
├─────────────────────────────────────────────────────────┤
│  Discrepancy Breakdown (tabs or segmented control)     │
│  [All] [Missing in Yours] [Missing in Provider] [Δ]   │
├─────────────────────────────────────────────────────────┤
│  Discrepancy Table                                      │
│  ┌────────┬────────┬──────────┬─────────┬───────────┐  │
│  │ A-Num  │ B-Num  │ Time     │ Type    │ Diff      │  │
│  ├────────┼────────┼──────────┼─────────┼───────────┤  │
│  │ ...    │ ...    │ ...      │ ...     │ ...       │  │
│  └────────┴────────┴──────────┴─────────┴───────────┘  │
├─────────────────────────────────────────────────────────┤
│  [Export CSV]  [Export PDF]  [New Comparison]          │
└─────────────────────────────────────────────────────────┘
```

**Summary Cards:**
- Total Records (Your CDRs)
- Total Records (Provider CDRs)
- Matched Records
- Total Discrepancy Value ($)

**Discrepancy Types (with counts):**
- Missing in Yours (Provider has, you don't)
- Missing in Provider (You have, provider doesn't)
- Duration Mismatch (matched call, different duration)
- Rate Mismatch (matched call, different rate)

**Table Features:**
- Sortable columns
- Pagination (50 per page)
- Search/filter
- Row expansion for full details

---

## Data Schema

### Canonical CDR Record

```typescript
interface CDRRecord {
  id: string;                    // Generated UUID
  source: 'A' | 'B';            // Which file it came from
  a_number: string;             // Normalized calling number
  b_number: string;             // Normalized called number
  seize_time: Date;             // Call attempt time
  answer_time: Date | null;     // Connect time (null if unanswered)
  end_time: Date;               // Call end time
  billed_duration: number;      // Seconds
  rate: number;                 // Per-minute rate
  raw_data: Record<string, any>; // Original row for reference
}
```

### Discrepancy Record

```typescript
interface Discrepancy {
  id: string;
  type: 'missing_in_a' | 'missing_in_b' | 'duration_mismatch' | 'rate_mismatch';
  record_a: CDRRecord | null;
  record_b: CDRRecord | null;
  difference: {
    field: string;
    value_a: any;
    value_b: any;
    monetary_impact: number;    // Calculated $ difference
  } | null;
}
```

### Results Summary

```typescript
interface ReconciliationResult {
  job_id: string;
  processed_at: Date;
  file_a: {
    name: string;
    total_records: number;
  };
  file_b: {
    name: string;
    total_records: number;
  };
  matched_count: number;
  discrepancies: {
    missing_in_a: number;
    missing_in_b: number;
    duration_mismatch: number;
    rate_mismatch: number;
    total: number;
    monetary_impact: number;
  };
  items: Discrepancy[];
}
```

---

## Matching Algorithm

### Phone Number Normalization

```typescript
function normalizePhoneNumber(input: string): string {
  // Remove all non-digits
  let digits = input.replace(/\D/g, '');
  
  // Handle common prefixes
  if (digits.startsWith('1') && digits.length === 11) {
    digits = digits.slice(1); // Remove leading 1
  }
  if (digits.startsWith('01') && digits.length === 12) {
    digits = digits.slice(2); // Remove 01 prefix
  }
  if (digits.startsWith('001') && digits.length === 13) {
    digits = digits.slice(3); // Remove 001 prefix
  }
  
  return digits;
}
```

### Timestamp Normalization

```typescript
function normalizeTimestamp(input: string | Date): Date {
  // Handle various formats
  // Return UTC Date object
  // Consider timezone in original data
}
```

### Matching Logic

Records match when:
1. Normalized A-number matches exactly
2. Normalized B-number matches exactly  
3. Seize time within 1-second tolerance

```typescript
// SQLite query for matching
const matchQuery = `
  SELECT 
    a.id as id_a,
    b.id as id_b,
    a.a_number,
    a.b_number,
    a.seize_time as seize_a,
    b.seize_time as seize_b,
    a.billed_duration as duration_a,
    b.billed_duration as duration_b,
    a.rate as rate_a,
    b.rate as rate_b
  FROM records_a a
  INNER JOIN records_b b
    ON a.a_number = b.a_number
    AND a.b_number = b.b_number
    AND ABS(strftime('%s', a.seize_time) - strftime('%s', b.seize_time)) <= 1
`;
```

### Discrepancy Detection

After matching:
1. Records in A with no match → Missing in B
2. Records in B with no match → Missing in A
3. Matched records with duration difference > 1 second → Duration mismatch
4. Matched records with rate difference → Rate mismatch

---

## API Routes

### POST /api/upload

Accepts multipart form data with file uploads.

```typescript
// Request
FormData {
  file_a: File,
  file_b: File
}

// Response
{
  success: true,
  job_id: string,
  file_a: { name: string, size: number },
  file_b: { name: string, size: number },
  preview_a: { headers: string[], sample_rows: any[][] },
  preview_b: { headers: string[], sample_rows: any[][] }
}
```

### POST /api/process

Start reconciliation with column mappings.

```typescript
// Request
{
  job_id: string,
  mapping_a: {
    a_number: string,      // Column name from file
    b_number: string,
    seize_time: string,
    answer_time: string,
    end_time: string,
    billed_duration: string,
    rate: string
  },
  mapping_b: { ... }
}

// Response (streaming progress updates via SSE)
event: progress
data: { stage: "parsing_a", percent: 45 }

event: complete
data: { job_id: string, redirect: "/results/[job_id]" }
```

### GET /api/results/[job_id]

Retrieve reconciliation results.

```typescript
// Response
{
  success: true,
  result: ReconciliationResult
}
```

### GET /api/export/[job_id]

Download report as CSV or PDF.

```typescript
// Query params: ?format=csv or ?format=pdf
// Response: File download
```

---

## Implementation Phases

### Phase 1: Project Setup & UI Shell (Day 1)
- [ ] Initialize Next.js with all dependencies
- [ ] Configure Tailwind and shadcn/ui
- [ ] Set up custom theme/colors
- [ ] Create layout components (Header, Footer)
- [ ] Build landing page with upload UI
- [ ] Implement file dropzone component

### Phase 2: File Processing (Day 2)
- [ ] Implement CSV parser
- [ ] Implement XLSX parser
- [ ] Implement ZIP extraction
- [ ] Create upload API route
- [ ] Build column mapping UI
- [ ] Add auto-detect for column headers

### Phase 3: Reconciliation Engine (Day 3)
- [ ] Set up SQLite integration
- [ ] Implement phone number normalization
- [ ] Implement timestamp normalization
- [ ] Build matching algorithm
- [ ] Create discrepancy detection logic
- [ ] Add processing progress feedback

### Phase 4: Results & Export (Day 4)
- [ ] Build results dashboard
- [ ] Create summary cards component
- [ ] Build discrepancy table with filtering
- [ ] Implement CSV export
- [ ] Add pagination and sorting

### Phase 5: Polish & Testing (Day 5-6)
- [ ] Animations and transitions
- [ ] Error handling and edge cases
- [ ] Test with real CDR samples
- [ ] Performance optimization
- [ ] Mobile responsiveness
- [ ] Deploy to production

### Phase 6: Nice-to-haves (Day 7+)
- [ ] PDF report generation
- [ ] Charts/visualizations
- [ ] AI-generated summary

---

## File Size Considerations

**Expected volumes:** Up to 2M records per file (daily CDRs from large carriers)

**Performance targets:**
- File upload: Handle up to 500MB files
- Parsing: Process 1M rows in under 60 seconds
- Matching: Complete in under 30 seconds with proper indexes

**SQLite indexes:**
```sql
CREATE INDEX idx_a_number ON records_a(a_number);
CREATE INDEX idx_b_number ON records_a(b_number);
CREATE INDEX idx_seize ON records_a(seize_time);
-- Same for records_b
```

**Memory management:**
- Stream-parse files, don't load entirely into memory
- Use SQLite for storage instead of in-memory arrays
- Process in chunks for progress updates

---

## Error Handling

### User-Facing Errors

| Scenario | Message |
|----------|---------|
| Invalid file format | "Please upload a CSV, XLSX, or ZIP file" |
| Empty file | "The uploaded file appears to be empty" |
| Missing required column mapping | "Please map all required fields before processing" |
| File too large | "File exceeds maximum size of 500MB" |
| Processing timeout | "Processing is taking longer than expected. Please try with a smaller file." |
| Parse error | "Unable to parse file. Please check the format and try again." |

### Logging

Log all errors server-side with:
- Timestamp
- Job ID
- Error type
- Stack trace
- File metadata (size, format)

---

## Deployment

### Coolify Configuration

The Hetzner server is already configured with Coolify at:
- **Server IP:** 49.13.124.226
- **Coolify UI:** http://49.13.124.226:8000

### Deployment Steps

1. Push code to GitHub repository
2. In Coolify, create new resource → Public Repository
3. Connect to GitHub repo
4. Configure build:
   - Build command: `npm run build`
   - Start command: `npm start`
   - Port: 3000
5. Deploy

### Environment Variables

```env
# None required for MVP
# Future: Add if integrating AI for PDF generation
# OPENAI_API_KEY=
# ANTHROPIC_API_KEY=
```

---

## Testing Data

For development, create sample CDR files with known discrepancies:

```typescript
// Generate test data script (lib/test-data.ts)
// Creates two CSV files:
// - file_a.csv: 1000 records
// - file_b.csv: 1000 records with:
//   - 50 missing (not in A)
//   - 50 extra (not in B)
//   - 50 duration mismatches
//   - 50 rate mismatches
//   - 850 perfect matches
```

---

## Success Criteria

Before the Miami demo (December 8):

- [ ] Tool loads quickly and looks professional
- [ ] Can upload two real CDR files
- [ ] Column mapping works intuitively
- [ ] Processing completes without errors
- [ ] Results clearly show discrepancies
- [ ] Can export to CSV
- [ ] Tested with at least one friendly carrier's data

---

## Open Questions for Development

1. **Timestamp formats:** What formats do carrier CDRs typically use? Need to handle multiple.
2. **Phone number edge cases:** International formats, short codes, extensions?
3. **Rate precision:** How many decimal places for rate comparisons?
4. **Duration tolerance:** Exactly 1 second, or should this be configurable?
5. **Large file handling:** Stream to disk during upload, or hold in memory?