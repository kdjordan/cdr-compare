# CDR Reconciliation Tool

A professional-grade web application for VoIP carriers to identify billing discrepancies between internal and provider CDR (Call Detail Records).

## Project Status

**Current Phase:** Initial Setup Complete ✅
**Demo Target:** December 8, 2025
**Deployment:** Hetzner CPX32 with Coolify
**Live URL:** TBD

## Tech Stack

- **Framework:** Next.js 14 (App Router) with TypeScript
- **Styling:** Tailwind CSS with custom dark theme
- **UI Components:** shadcn/ui
- **File Processing:** papaparse, xlsx, jszip
- **Database:** better-sqlite3 (ephemeral matching)
- **Animations:** Framer Motion
- **Icons:** Lucide React

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Project Structure

```
src/
├── app/
│   ├── api/              # API routes for upload, process, export
│   ├── layout.tsx        # Root layout with dark theme
│   ├── page.tsx          # Landing/upload page
│   └── globals.css       # Custom theme and styles
├── components/
│   ├── ui/               # shadcn/ui components
│   ├── upload/           # File upload components
│   ├── mapping/          # Column mapping UI
│   ├── processing/       # Progress indicators
│   ├── results/          # Results dashboard
│   └── layout/           # Header, Footer
├── lib/
│   ├── parser/           # CSV, XLSX, ZIP parsers
│   ├── reconciliation/   # Matching algorithm
│   └── utils.ts          # Utilities
├── types/
│   └── index.ts          # TypeScript definitions
└── hooks/                # Custom React hooks
```

## Features (Planned)

### Phase 1: Setup ✅
- [x] Next.js project initialization
- [x] Custom dark theme
- [x] Project structure
- [x] Type definitions

### Phase 2: File Processing
- [ ] CSV/XLSX/ZIP parsers
- [ ] File upload API
- [ ] Column mapping UI
- [ ] Auto-detect column headers

### Phase 3: Reconciliation Engine
- [ ] SQLite integration
- [ ] Phone number normalization
- [ ] Matching algorithm
- [ ] Discrepancy detection

### Phase 4: Results & Export
- [ ] Results dashboard
- [ ] Summary cards
- [ ] Discrepancy table
- [ ] CSV export

### Phase 5: Polish
- [ ] Animations
- [ ] Error handling
- [ ] Performance optimization
- [ ] Mobile responsiveness

## Development Workflow

1. **Upload**: Users upload two CDR files (Your CDRs & Provider CDRs)
2. **Mapping**: Map columns to canonical schema (A-number, B-number, timestamps, etc.)
3. **Processing**: System normalizes and matches records using SQLite
4. **Results**: Display discrepancies with filtering, sorting, and export options

## Design System

### Theme
- **Primary:** Dark theme with professional blue-black tones
- **Accent:** Vibrant green (#2dd4bf) for CTAs and success states
- **Typography:** IBM Plex Sans (body), IBM Plex Mono (headings/data)

### Semantic Colors
- **Missing:** Red (records in one file but not the other)
- **Mismatch:** Amber (duration or rate differences)
- **Matched:** Green (perfect matches)

## Performance Targets

- Handle up to 500MB file uploads
- Process 1M records in <60 seconds
- Match records in <30 seconds with proper indexing

## Contributing

This is an internal tool for demo purposes. For questions or issues, contact the development team.

## License

Proprietary - Internal Use Only
