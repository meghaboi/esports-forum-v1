import { Button } from "@/components/ui/Button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-background text-foreground">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex flex-col gap-8">
        <h1 className="text-4xl font-bold text-center">Valorant Forum Foundation</h1>
        <p className="text-muted text-center max-w-2xl">
          Welcome to the foundational setup for the Valorant match-centric forum. 
          Built with Next.js 14, TypeScript, Tailwind CSS, Prisma, and JWT Auth.
        </p>
        
        <div className="flex gap-4">
          <Button variant="primary">Primary Action</Button>
          <Button variant="secondary">Secondary Action</Button>
          <Button variant="outline">Outline</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mt-8">
          <div className="p-6 bg-surface border border-border rounded-none">
            <h3 className="text-accent-green font-bold mb-2">LIVE / WON</h3>
            <p className="text-sm text-muted">Example of live match or won status color.</p>
          </div>
          <div className="p-6 bg-surface border border-border rounded-none">
            <h3 className="text-accent-red font-bold mb-2">HOT / UPSETS</h3>
            <p className="text-sm text-muted">Example of trending or upset status color.</p>
          </div>
          <div className="p-6 bg-surface border border-border rounded-none">
            <h3 className="text-accent-yellow font-bold mb-2">ONGOING</h3>
            <p className="text-sm text-muted">Example of ongoing match status color.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
