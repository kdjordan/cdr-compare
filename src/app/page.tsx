export default function Home() {
  return (
    <main className="min-h-screen">
      <div className="gradient-mesh min-h-screen">
        <div className="container mx-auto px-4 py-16">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <h1 className="text-5xl font-bold font-mono mb-4 bg-gradient-to-r from-accent to-emerald-400 bg-clip-text text-transparent">
              CDR Reconciliation Tool
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Professional-grade CDR reconciliation for VoIP carriers. Upload your records,
              map your columns, and identify billing discrepancies in seconds.
            </p>
          </div>

          {/* Upload Section - To be implemented */}
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* File A Upload */}
              <div className="bg-card border border-border rounded-lg p-8">
                <h2 className="text-xl font-semibold mb-4 font-mono">Your CDRs</h2>
                <div className="border-2 border-dashed border-border rounded-lg p-12 text-center hover:border-accent/50 transition-colors cursor-pointer">
                  <p className="text-muted-foreground">
                    Drag & drop or click to upload
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    CSV, XLSX, or ZIP (max 500MB)
                  </p>
                </div>
              </div>

              {/* File B Upload */}
              <div className="bg-card border border-border rounded-lg p-8">
                <h2 className="text-xl font-semibold mb-4 font-mono">Provider CDRs</h2>
                <div className="border-2 border-dashed border-border rounded-lg p-12 text-center hover:border-accent/50 transition-colors cursor-pointer">
                  <p className="text-muted-foreground">
                    Drag & drop or click to upload
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    CSV, XLSX, or ZIP (max 500MB)
                  </p>
                </div>
              </div>
            </div>

            {/* Next Button */}
            <div className="text-center">
              <button
                disabled
                className="px-8 py-3 bg-accent text-accent-foreground font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed glow-accent transition-all"
              >
                Next: Map Columns
              </button>
            </div>
          </div>

          {/* Features */}
          <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="text-center">
              <div className="text-4xl mb-4">⚡</div>
              <h3 className="font-semibold mb-2">Lightning Fast</h3>
              <p className="text-sm text-muted-foreground">
                Process millions of records in seconds with optimized matching
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-4">🎯</div>
              <h3 className="font-semibold mb-2">Precise Matching</h3>
              <p className="text-sm text-muted-foreground">
                Intelligent normalization handles phone format variations
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="font-semibold mb-2">Clear Insights</h3>
              <p className="text-sm text-muted-foreground">
                Detailed reports show exactly where discrepancies occur
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
