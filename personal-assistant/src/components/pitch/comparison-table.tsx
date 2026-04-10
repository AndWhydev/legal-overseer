"use client";

interface Row {
  name: string;
  channels: string;
  memory: string;
  invoicing: string;
  autonomy: string;
  price: string;
  highlight?: boolean;
}

const ROWS: Row[] = [
  {
    name: "Zo",
    channels: "SMS, Email, Telegram",
    memory: "Conversational",
    invoicing: "No",
    autonomy: "On/off",
    price: "$18/mo",
  },
  {
    name: "Hynge",
    channels: "Telegram, WhatsApp, Slack",
    memory: "Conversational",
    invoicing: "No",
    autonomy: "Draft only",
    price: "$59 to $149/mo",
  },
  {
    name: "Sintra",
    channels: "Chat only",
    memory: "Brand voice",
    invoicing: "No",
    autonomy: "No",
    price: "$39 to $197/mo",
  },
  {
    name: "Lindy",
    channels: "Email, Slack, Phone",
    memory: "Per agent",
    invoicing: "Via integrations",
    autonomy: "Per agent",
    price: "$20 to $299/mo",
  },
  {
    name: "Ambiguous",
    channels: "Email, Slack",
    memory: "Agentic",
    invoicing: "No",
    autonomy: "No",
    price: "TBD (a16z)",
  },
  {
    name: "BitBit",
    channels: "WhatsApp, iMessage, SMS, Email, Slack",
    memory: "Memory Palace",
    invoicing: "Built in",
    autonomy: "Observer to Autopilot",
    price: "$99 to $499/mo",
    highlight: true,
  },
];

export function ComparisonTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-xs text-zinc-400">
            <th className="pb-3 pr-4 font-medium" />
            <th className="pb-3 pr-4 font-medium">Channels</th>
            <th className="pb-3 pr-4 font-medium">Memory</th>
            <th className="pb-3 pr-4 font-medium">Invoicing</th>
            <th className="pb-3 pr-4 font-medium">Autonomy</th>
            <th className="pb-3 font-medium">Price</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr
              key={row.name}
              className={`border-b border-zinc-100 ${
                row.highlight
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600"
              }`}
            >
              <td
                className={`py-3 pr-4 font-medium ${
                  row.highlight ? "text-white" : "text-zinc-900"
                }`}
              >
                {row.name}
              </td>
              <td className="py-3 pr-4">{row.channels}</td>
              <td className="py-3 pr-4">{row.memory}</td>
              <td className="py-3 pr-4">{row.invoicing}</td>
              <td className="py-3 pr-4">{row.autonomy}</td>
              <td className="py-3">{row.price}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
