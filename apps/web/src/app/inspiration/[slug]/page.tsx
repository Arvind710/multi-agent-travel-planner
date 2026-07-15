import { Metadata } from "next";

interface Props {
  params: { slug: string };
}

// Generate static params for common inspiration pages
export async function generateStaticParams() {
  return [
    { slug: "rajasthan-royal-tour" },
    { slug: "kerala-backwaters" },
    { slug: "golden-triangle" },
    { slug: "himalayan-retreat" },
  ];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const titleName = params.slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return {
    title: `${titleName} | Raah Travel Planner`,
    description: `Discover the best itinerary for ${titleName}. Plan your trip easily with Raah's AI agent.`,
  };
}

export default function InspirationPage({ params }: Props) {
  const titleName = params.slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-12">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">{titleName}</h1>
        <p className="text-xl text-gray-600 mb-8">
          Explore our curated inspiration for {titleName}. Customize this trip and make it your own.
        </p>

        <div className="bg-white p-8 rounded-2xl shadow-sm border mb-8">
          <h2 className="text-2xl font-semibold mb-4">Why you'll love this trip</h2>
          <ul className="list-disc pl-5 space-y-2 text-gray-700">
            <li>Handpicked accommodations matching your style.</li>
            <li>Optimized routing to save travel time.</li>
            <li>Authentic experiences curated by local experts.</li>
          </ul>
        </div>

        <a
          href={`/plan/new?inspiration=${params.slug}`}
          className="inline-block bg-[var(--color-primary)] text-white px-8 py-4 rounded-full font-medium text-lg hover:bg-opacity-90 transition-colors shadow-lg hover:shadow-xl"
        >
          Customize this trip
        </a>
      </div>
    </div>
  );
}
