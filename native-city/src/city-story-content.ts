import type {CityStoryContent} from './city-story-contract.ts';

/** First-playable story copy. Narrative-owned; runtime reads this object only. */
export const CITY_STORY_CONTENT: CityStoryContent = {
  schemaVersion: 1,
  id: 'bay-last-delivery',
  title: "The Last Order",
  synopsis:
    "Before finishing work, Ahui hands you the insulated bag for the Binhai order. First go to the Keyuan After-Work Stop and have Alin validate it, Then decide whether to deliver directly to the Binhai handoff point, Or go around the park to the municipal maintenance station and give the clamp to Lao Chen.",
  firstStep: 'hub-pickup',
  reward: 180,
  people: {
    ahui: {name: "A Hui", role: "Daily payout at the station, Order delivery"},
    alin: {name: "A Lin", role: "Keyuan Office Worker, Order redemption"},
    laochen: {name: "Lao Chen", role: "City worker, This job is waiting for clamps at the park maintenance station"},
    player: {name: "You", role: "Daily Pay Delivery"},
  },
  steps: [
    {
      id: 'hub-pickup',
      place: 'hub',
      title: "The station cannot close yet",
      objective: "Stop at Haiwan Life Station and get out, Collect the insulated bag from Ahui.",
      action: 'collect',
      lines: [
        {speaker: 'ahui', text: "That Binhai order is still pending, Evening shift returns have not arrived, I cannot get away."},
        {speaker: 'ahui', text: "Here is the insulated bag. First go to Keyuan Station and have Alin verify the code, Another Delivery to Binhai."},
      ],
      next: 'office-meet',
    },
    {
      id: 'office-meet',
      place: 'office',
      title: "Match codes at the window",
      objective: "Stop outside the Keyuan After-Work Stop and exit the vehicle, Find Alin to verify the pickup code.",
      action: 'talk',
      lines: [
        {speaker: 'alin', text: "Code Matched. The work group chat is urging me to return, I need to leave first."},
        {speaker: 'alin', text: "Lao Chen still has a clamp in my bag. Deliver to Binhai first, Or drop it off at the park on the way?"},
      ],
      choices: [
        {
          id: 'go-bay-direct',
          label: "First deliver the goods to the coastal handoff point",
          next: 'bay-direct',
          consequence: "Do not go to the park. Alin Returns to the Office, The clamp was left at Keyuan After-Work Station, Chen will pick it up tomorrow morning; Next stop: roadside handoff point on Binhai Road.",
        },
        {
          id: 'detour-park',
          label: "First go to the park maintenance station and give the clamp to Lao Chen",
          next: 'office-spare',
          consequence: "Still collect the clamp from A Lin at the Keyuan After-Work Rest Stop, Then go to the park urban maintenance station, Finally deliver to the Binhai handoff point.",
        },
      ],
    },
    {
      id: 'office-spare',
      place: 'office',
      title: "The clamp in the bag",
      objective: "Stop by the window at the Keyuan After-Work Stop and exit the vehicle, Collect the clamp for Lao Chen from Alin.",
      action: 'collect',
      lines: [
        {speaker: 'alin', text: "give, I signed it at noon."},
        {speaker: 'alin', text: "Take it and go, I went back to the office."},
      ],
      next: 'park-help',
    },
    {
      id: 'park-help',
      place: 'park',
      title: "Maintenance station handover",
      objective: "Stop fully at the park municipal maintenance station and exit the vehicle, Give the clamp to Lao Chen.",
      action: 'deliver',
      lines: [
        {speaker: 'laochen', text: "As long as the clamp arrives, Water will pool tonight unless we switch aisles."},
        {speaker: 'laochen', text: "That Binhai bag is still waiting, You go."},
      ],
      next: 'bay-after-park',
    },
    {
      id: 'bay-direct',
      place: 'bay',
      title: "Deliver while hot",
      objective: "Stop fully at the handover point beside Binhai Road and exit the vehicle, Hand over the insulated bag.",
      action: 'deliver',
      lines: [
        {speaker: 'ahui', text: "The other side replied, Food Too Hot to Hold, Signed for."},
        {speaker: 'ahui', text: "Return to the bay station to settle."},
      ],
      next: 'hub-end-direct',
    },
    {
      id: 'bay-after-park',
      place: 'bay',
      title: "Deliver to, But it warmed up",
      objective: "Stop fully at the handover point beside Binhai Road and exit the vehicle, Hand over the insulated bag.",
      action: 'deliver',
      lines: [
        {speaker: 'ahui', text: "It was signed, at least, Says It Is No Longer Hot."},
        {speaker: 'ahui', text: "You still get paid, Come back."},
      ],
      next: 'hub-end-detour',
    },
    {
      id: 'hub-end-direct',
      place: 'hub',
      title: "Finish on Time",
      objective: "Return to Haiwan Life Station, stop and get out, Settle up with Ahui.",
      action: 'talk',
      lines: [
        {speaker: 'ahui', text: "Deliver before the shift change, I will transfer 180 to your account."},
        {speaker: 'ahui', text: "Lao Chen asks about clamps, He said he would pick it up himself at Keyuan Station tomorrow morning."},
      ],
      terminal: true,
    },
    {
      id: 'hub-end-detour',
      place: 'hub',
      title: "The order was settled anyway",
      objective: "Return to Haiwan Life Station, stop and get out, Settle up with Ahui.",
      action: 'talk',
      lines: [
        {speaker: 'ahui', text: "They will accept the food even if it is lukewarm, You will get the full 180."},
        {speaker: 'ahui', text: "Old Chen said thanks over the radio. Route the next parts through the repair station, Do not take detours on deliveries."},
      ],
      terminal: true,
    },
  ],
};
