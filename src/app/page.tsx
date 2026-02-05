import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Container } from "@/components/ui/Container";

export default function Home() {
  return (
    <main className="min-h-screen py-24 bg-background text-foreground">
      <Container>
        <div className="z-10 w-full items-center justify-between font-mono text-sm flex flex-col gap-8">
          <h1 className="text-4xl font-bold text-center">Valorant Forum Foundation</h1>
          <p className="text-muted text-center max-w-2xl">
            Welcome to the foundational setup for the Valorant match-centric forum. 
            Built with Next.js 14, TypeScript, Tailwind CSS, Prisma, and JWT Auth.
          </p>
          
          <div className="flex gap-4">
            <Button variant="primary">Register</Button>
            <Button variant="outline">Login</Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Live Match
                  <Badge variant="success">LIVE</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted">Example of a live match card using the flat UI design.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Hot Topic
                  <Badge variant="danger">HOT</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted">Example of a trending or upset status card.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Tournament
                  <Badge variant="warning">ONGOING</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted">Example of an ongoing tournament status card.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </Container>
    </main>
  );
}

