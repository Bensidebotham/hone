import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Reveal } from "@/components/landing/reveal";

const FAQS = [
  {
    q: "Is Hone free?",
    a: "Yes — sign in with Google and start tracking your applications right away.",
  },
  {
    q: "How do jobs get added?",
    a: "Hone surfaces fresh early-career roles every 24 hours. You can also paste any job to track it.",
  },
  {
    q: "Is my data private?",
    a: "Your applications and profile are tied to your account and only visible to you.",
  },
  {
    q: "What roles are covered?",
    a: "The daily feed focuses on software and early-career tech roles across the US and remote.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-6 py-20">
      <Reveal>
        <p className="text-center text-sm font-semibold text-primary">FAQ</p>
        <h2 className="mt-2 text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
          Questions, answered
        </h2>
      </Reveal>
      <Reveal delay={0.05} className="mt-10">
        <Accordion>
          {FAQS.map((item) => (
            <AccordionItem key={item.q} value={item.q}>
              <AccordionTrigger>{item.q}</AccordionTrigger>
              <AccordionContent>{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Reveal>
    </section>
  );
}
