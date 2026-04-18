I am at Hack Princeton, and I need to win the health care track, and this is my idea. I want to learn AWS while working with this as well. This is what I want to work with.



Okay, so what I'm planning to build is something for an app or, I will say, a service which can be used by people who have grandparents. Why will they use this? Because they can't be physically always present around them to take care of them, but would love to have live, just like a nanny would be there. That's why we are building this. The intuition is, and I would say the baseline assumption that I want to go forward with, will be that we have set up a couple of cameras in the house to monitor a few actions. When I say monitor a few actions, it can be different things.
1. The pantry: Now let's assume that in front of the camera, like the pantry camera, we have all the groceries put up. Let's say it's fruits, let's say it's milk, and whatnot. You understand groceries, right? The plan is that if the groceries go below a certain amount, like if they are almost towards the end, like if they are finished, then the service will order the grocery directly. This is one of the features, the first feature, that it orders the grocery directly, and how it does it will go into that later.
2. The second feature is basically the second camera, the second camera is at the medicine desk. It looks at what medicines you are taking and if you are taking them at the right time. If you take them at the right time and take the correct amount, then it's okay. If you do not, then it is an issue. What happens in this case is that the service sends an alert to the caretaker, which we are going to call the caretaker. It is basically the people whose grandparents we are talking about, so they will be addressed as caretakers. Just want to confirm it, right? Now, going forward here, the two parties that we will be dealing with will be addressed as patient and care tech. You get the point.  How do you implement this? I think what I'm choosing is that we will need a model which continuously looks at what the live video frames are saying. Maybe let's say at 5-second intervals or 10-second interval; it can be anything. For that thing, to figure out what is happening, we are going to use a Gemini model, and specifically it is going to be Gemini ER robotics 1.6. That is the model name that we are going to use; it is available via Gemini API. That is going to be the first thing, and this will be implemented in two different modules.
1. The first module does the same thing, but here the model, one for Gemini, will get the video stream from the pantry camera and continuously get data from a database. What is this database? The database is basically a list of grocery items which we are going to compare the items against. Let's say the grocery list has 10 items, and in the pantry camera's view we can only see 7 items. What we are going to do is we are always going to compare what we see in the pantry camera. We figure that out using the robotics ER model, and then we compare that list of items with the inventory list. If it is very low, let's say it is only 2 items out of 10, it is like 20%. It means that it needs replenishment, and then the model will say, based on the frames that I see and the inventory list that I was given, based on that I believe that we should actually buy stuff. It sends some action requests to the next node, and the next node is basically the next module that we will come back to later. I can finish the Gemini workflow first.
2. What's the next module in the same workflow? Basically, what happened is that Gemini generated an action, right? It gets passed to a new agent, and I don't think it needs to be an agent; actually, it can be very well coded. We are going to use Not API. It is the Not API feature, the shopping feature, where we can order things directly. The initial response that piece spoke about, which we got from Gemini, is going to be like, "Okay, we need replenishment." It will also tell, "Okay, we need replenishment of these items." That is what it is going to give. When it is going to give it, we can have a setup code, and I don't think it needs to be LLM code. It can just be a very well done code which takes up these item names and goes to the Not API SDK and then orders it on Walmart. That is what I'm thinking.


Now let's look at what the next module, the second module that we have, does. The second module is going to be a Gemini module for the medicine table working with the medicine table camera. The medicine table camera is looking at what medicines are taken. So let's assume that it is pointed downwards towards their table and what medicine is like, and let's say the package tablets are right on the table. Whenever, on the given time, it takes the patient takes a tablet, then it will check if, based just on the vision capabilities of Google Gemini ER robotics 1.6, it is going to figure out how many tablets were taken and which they were. So the important thing is even this Gemini will have a grounding, so what the grounding will be a prescription. A prescription of tablets that times to be taken and also what symptoms do we have? Why is the patient taking these actions and taking these tablets because let's say it has a profile of what patient really is going through and we'll need that later. I'll tell you why. This is in the form of a database. If not a database, it can be implemented as a database, but we can look at it later. One can be a profile markdown, just, and the prescription can be in the form of database entries, not an issue there. So yeah, coming back to it, Gemini will again input from the camera, which will be frames by frames around the time when the tablet is to be taken, and also the prescription, what tablets and how many tablets are taken. What it is supposed to do is it's supposed to see if, after taking, the number of tablets have reduced in the packaging that we can see, it is just supposed to figure it out and it is supposed to compare it to the prescription and say and tell if the right amount of tablets or if tablets were taken anyway. It's supposed to do that. If it is taken here, that's a good thing. It's going to be a yes output, if it does not take, it's going to be a no alert, which is basically the same type of output message, but it will be an output message in a similar JSON format. Then what happens with this? So the output of the Gemini module number two model that we have we are currently working with is yes or no, right? So this goes to a great tool called photon. Photon is basically something that is used for sending iMessages, and that's why we needed it. So who does it send the iMessages to? We'll come back to that, but the complete point is that if it's a yes, like if the medicines were taken correctly, then it sends an iMessage to the caretaker that medicines were taken correctly. If it was not taken correctly, then it sends a message no as an alert on the iMessage caretaker that the medicines were not taken properly, and it can come up with a message as well. So when the initially the Gemini model outputs are yes or no, it's not just yes or no, but it can also include okay. Yes, these medicines, and it can tell which medicines were to be taken and they were taken successfully or no, these were not taken successfully. Please call, please check up on the patient. This can be a message, and this gets delivered to the caretaker via iMessage. This was model 2 working.


Now let's get into tech stack intricacies .

1. Onboarding and setup:

Platform where caretaker can register himself and then he can add a camera to its surveillance --> How does it do it? I think initially on the sign up we can ask for every device, like, how is it going to be used. Is it a caretaker dashboard? That's going to be the first option. Or second, is it going to be used as a nanny cam? That's what we are going to name it. So nanny pantry cam, nanny medicine cam. So is it going to be a nanny cam? So if we see it is a nanny cam then it generates a QR code that the caretaker is supposed to scan. When the caretaker scans it, the nanny cam's camera would start recording and the recording can be seen live on the caretaker's dashboard. So caretaker will have both the cams for that patient at least as of now. And all of this you need to understand this is going to be an XJS front end so that I can use it upon a mobile or even a laptop. A laptop's camera can work for it, so any camera should work, so that's why we are building this around web. Here you get it. As of now I don't think I need any type of sign-ins, so we are just gonna work on all utility altogether and that's it. So that's the number one, this is like the onboarding process.

2. Gemini Modules:

Next up, we come to the Gemini part of both the nano camps, and I think it is supposed to be. I believe we are gonna host all of this right, so might as well use AWS. So I think we should have one EC2 server, if that makes sense, for one EC2 server which deals with both the Gemini modules; that's gonna be its task. So that's the task altogether. And yeah, so it will be responsible. You need to understand that everything, like the streaming, which I want you to go through and go through all of this and check if this was feasible, like everything. If not a video stream, and we don't want a video stream. We want to take 10 seconds of snapshots from that camera, like from the nano camps. We have to send it to the modules in the same EC2 server where both the Gemini models are, so we might need two different API gateways for it. I don't know. It's not needed that we use an API gateway. So this altogether, but we can even need two endpoints for that at least, so where we can send the image directly. When we send it, this module, like this EC2 instance, in as a whole, is gonna generate is gonna come up with two different actions as we knew. The first model will be about the first model will give an answer about what needs to be ordered, and the second model will give an answer about what the status of like or what the medicines take correctly. Also want to tell you, these will be like two different inputs in the same EC2 instance. So I wanted these are not us. If you understand, this is not a serial workflow. We are parallelizing it from the nanny camps itself. So both of them hitting the same EC2 instance; it does not I should not make a problem because should not have any problem that I am talking about. It should not make all of this serial because there are two different Gemini modules running on that. If this is possible, if it's not, we can also split this altogether and do a different two. Okay, so when we are done with that, I think that's how the Gemini module will work, and you can decide about how do we structure these two instances at a single? Do we get both the modules on a single instance or two different instances?


Given below is the documentation of the Gemini model. You need to understand the outputs and the inputs of the model. I think the input is fairly simple, which are basically images. The outputs are basically, let's say if you are using the bounding boxes thing, then it's not going to come directly on the thing, so directly on the image. So you need to understand what it is and then you need to interpret it.


- https://ai.google.dev/gemini-api/docs/robotics-overview
- https://ai.google.dev/gemini-api/docs/robotics-overview#object-detection-bounding-boxes


3. Connectors to Gemini modules:

The third is the connectors that Gemini has. These two Gemini modules will have. So as I said, the module 1, which is basically dealing with the pantry, will have a connector to an inventory list for that patient. And this can be a simple database, OK, it can be a super base, to be honest, or it can be actually leading to a super base, so you can just pick things from the database. A simple select all query can be a thing for the inventory list, like, yeah, inventory list, and that's what gets into, like, that's what we give to the Gemini module when the screenshot, like the frame, comes through after 10 seconds. So the workflow for the Gemini module 1 will be after the designated interval, when the frame comes through, which is basically an image, it calls this query upon the super base for the given patient ID and then also attaches the result of the query to this to the prompt that we are going to give to the Gemini model, and it sends it to, like, find and basically compare the image with the list. That's how you're gonna write the prompt. One thing I want to tell you about this module is that the inventory list should be connected to caretaker. So the caretaker can choose the patient and can choose, like, it basically chooses the patient and it can go through, like, it can change what they eat. Like so they decide what they eat. So because they need to make sure that they are eating healthy. So whatever the inventory is, they are going to edit it. The name and quantity. That's it. That's it, nothing else. Okay, when we are done with that, so that's the Gemini model 1 connectors and you know you understood, like, how it was connected to the caretaker as well. For the module 2 connectors, which is basically connecting the nani cams Gemini module with one connector and it is going to be a prescription which is basically again by the patient ID and contains the name of the tablet, the timing at which it is supposed to be taken, the quantity, and why the patient is taking the tablet. So, for example, it can be a tablet for allergy, and the like. A fourth field that I spoke about should have this has been taken because the patient has maybe a gluten allergy, so we will need this column in a later feature. Okay, so that's how you structure the module. That's how we structure the connectors to the model too. Again, I think I like this. This will be, as I said, it's gonna be a database, and I prefer using SuperBase because that's easy. So yeah, it's gonna be SuperBase. So now that's basically based on this complete third section, like third point, or we are done with the connectors for the Gemini modules.

4. Knot API Module:

This is the not API module, which will be responsible for automatically making the transactions like making the order, placing the order, making transactions based on the card details given. So what we are going to do is this is going to be placed. I think I have already made the decision. I know in the previous section I said you can make a decision, but I think in a single EC2 instance, we can have the Gemini module connected to it, and after that, its output will be given to this not API module. Why an API, I guess, but yeah, not just part of the script, but can be part of the script, but yeah, we don't keep it scalable such that it doesn't take up too much time because not API, if it's part of the script, it can take too much time and maybe hold the process of the Gemini module work, so we don't want that. So we want it completely as a complete different process. If not possible in the same EC2 module, we can build a separate EC2 module just for this not API module. So what is this going to do, and I am attaching you the documentation for the shopping feature, often not API. What it does is this basically you can tell it can take the list of items, and it's going to search for Walmart or any services where I think we can take away, and we will be testing. We can look upon the uh like the grocery chains and stores that are available via not API but yeah any which ways the task is that we will already have the credit card or basically the card details added so again here comes the caretakers part the caretaker can actually do this on their hand front-end so basically adding card details is what they do like they can do it for so what they can do is for every patient they can set a different card and that card will be used for that given patients all the purchases and that also gets tracked perfectly so that's what we're going to make all of this as you know comes across you at the UI which is also a next.js UI back in can be try script at this point and all of this will come if we onboarding or if like we onboarding you choose like this device will be used in as a whatever I said before like caretaker dashboard whatever it was you use the terminology that I used before so yeah so the card can be added by the caretaker for a given patient and those card details will be used by the not API SDK to make all the transactions that's what this guy this model is going to do when a transaction is done is successful it only shows up on the caretaker dashboard UI that the transaction was successful and that's it and this will operate and this will be done using like a trigger because we do not need caretakers dashboard to be current like always continuously fetching like did we make a transition or make a transition it has nothing to do with it it only works like it only updates on the UI when it actually has taken place and as I said it only takes place when the groceries were actually less so we reduce basically the number of requests here and that these requests will only take place when the groceries are less okay so this was not APIs module.

- https://docs.knotapi.com/sdk/web
- https://docs.knotapi.com/vaulting/quickstart
- https://docs.knotapi.com/shopping/quickstart

5. Photon Imessaging module:

So now next is going to be an iMessaging Module. What this module is going to do is that it's going to work with the second major flow that we have, which is basically the second Gemini module, which deals with tablets. So once Gemini gives the response, which is going to be yes, the tablets were taken currently, and what tablets were taken currently, or no, these tablets were not taken correctly, that's going to be a message, right? So this is going to go to Photon. An interesting thing about Photon is that it only works for Mac OS. So what we are going to do is we're going to have an AWS EC2 instance which has Mac OS (an EC2 instance with Mac OS, like it would not be Linux anymore, assuming the rest are Linux instances). I think that's the correct choice, but yeah, any way. So this goes to the Photon SDK or whatever it has in the Photon module or Photon in EC2, and when it gets the request, it is supposed to process and text basically an iMessage to the caretaker. So what all does it have? It's going to have caretakers' mobile (so a mobile phone), again this needs to be in the SUHA base as well, like caretaker details. In that, it needs to be there, maybe we can get this during onboarding of the caretaker when we choose if this device is going to be used as a caretaker module. If in any case Photon needs a sender's number as well, then check if this is a need for Photon. If yes, then we might need to add Photon (the patient's phone number as well) during onboarding. If no, then it's going to be good. I would love that to happen. So yeah, the only caveat in Photon is that it will be on a Mac OS. That's the only thing, so no problem with that. I think that's it for the Photon iMessaging module.

I think one more thing that we need to add in this is that whatever message the Photon is going to send also appears on the dashboard of the app for the caretaker. This functionality will be part of the same macOS EC2 module. I don't know if we need to write some if this code will be different than what we are doing for updating the dashboard upon ordering or something like that, like ordering groceries. I think it should be similar; I don't know if it needs a different language just because it is on a macOS, but it should be similar. That's what we are actually planning to do with the Photon messaging module.

I have attached a boilerplate prompt that you can edit according to our needs and then use it upon yourself

```photon

> ## Documentation Index
> Fetch the complete documentation index at: https://docs.photon.codes/llms.txt
> Use this file to discover all available pages before exploring further.

# Getting Started

> Install spectrum-ts and send your first message across platforms

export const TypeTooltip = ({name, type, children}) => {
  const [visible, setVisible] = React.useState(false);
  const [pos, setPos] = React.useState({
    top: 0,
    left: 0
  });
  const triggerRef = React.useRef(null);
  const show = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 6,
        left: rect.left
      });
    }
    setVisible(true);
  };
  const hide = () => setVisible(false);
  return <>
      <span ref={triggerRef} onMouseEnter={show} onMouseLeave={hide} style={{
    cursor: "pointer",
    position: "relative",
    display: "inline"
  }}>
        {children || <code>{name}</code>}
      </span>
      {visible && <span style={{
    position: "fixed",
    top: pos.top,
    left: pos.left,
    zIndex: 9999,
    padding: "8px 12px",
    borderRadius: "8px",
    fontSize: "13px",
    lineHeight: "1.5",
    fontFamily: "'Azeret Mono', monospace",
    whiteSpace: "pre",
    backgroundColor: "var(--tw-prose-pre-bg, #1e1e1e)",
    color: "var(--tw-prose-pre-code, #e5e5e5)",
    border: "1px solid var(--border, rgba(128,128,128,0.2))",
    boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
    pointerEvents: "none"
  }}>
          {type}
        </span>}
    </>;
};

`spectrum-ts` is a unified messaging SDK for TypeScript. Write your logic once, deliver it across every platform — iMessage, WhatsApp Business, your terminal, or a custom platform you build yourself.

<Note>
  Spectrum is in early preview. APIs may change between releases.
</Note>

## Installation

<CodeGroup>
  ```bash npm theme={null}
  npm install spectrum-ts
  ```

  ```bash pnpm theme={null}
  pnpm add spectrum-ts
  ```

  ```bash yarn theme={null}
  yarn add spectrum-ts
  ```

  ```bash bun theme={null}
  bun add spectrum-ts
  ```
</CodeGroup>

Requires TypeScript 5 or later.

## Core concepts

Spectrum is built around four primitives:

| Primitive             | What it represents                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Message**           | An incoming piece of content — text, attachments, or structured data — from any platform.                                                     |
| **Space**             | A conversation context. A DM, a group chat, a terminal session. You send messages *into* a space.                                             |
| **User**              | A participant on a platform, identified by a platform-specific ID.                                                                            |
| **Platform provider** | A platform adapter (iMessage, terminal, WhatsApp, or your own) that translates platform-specific protocols into Spectrum's unified interface. |

Every message arrives as a `[Space, Message]` tuple. The space gives you the ability to respond; the message gives you the content and metadata.

## Quickstart

### Get your credentials

Find your `PROJECT_ID` and `SECRET_KEY` in your project **Settings** on the [dashboard](https://app.photon.codes/).

### Run your first app

```ts theme={null}
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";

const app = await Spectrum({
  projectId: "your-project-id",
  projectSecret: "your-project-secret",
  providers: [
    imessage.config(),
  ],
});

for await (const [space, message] of app.messages) {
  if (message.content.type === "text") {
    console.log(`[${message.platform}] ${message.sender.id}: ${message.content.text}`);
    await space.send("hello world");
  }
}
```

Projectless providers (like `terminal`) can be used without credentials:

```ts theme={null}
import { Spectrum } from "spectrum-ts";
import { terminal } from "spectrum-ts/providers/terminal";

const app = await Spectrum({
  providers: [terminal.config()],
});
```

## The app instance

`Spectrum()` returns a <TypeTooltip name="SpectrumInstance" type={`type SpectrumInstance<Providers extends PlatformProviderConfig[] = PlatformProviderConfig[]> = SpectrumLike<Providers> & CustomEventStreams<Providers> & {
readonly messages: AsyncIterable<[
    Space,
    Message
]>;
stop(): Promise<void>;
send(space: Space, ...content: [
    ContentInput,
    ...ContentInput[]
]): Promise<void>;
responding<T>(space: Space, fn: () => T | Promise<T>): Promise<T>;
};`} /> — an object that merges a message stream with platform-specific custom event streams.

```ts theme={null}
app.messages                 // AsyncIterable<[Space, Message]>
await app.send(space, ...)   // send into a space
await app.responding(space, fn)  // run fn with a typing indicator
await app.stop()             // graceful shutdown
```

Custom events emitted by providers are exposed as flat async iterables on the same object — see [Custom events and lifecycle](/spectrum-ts/custom-events-and-lifecycle).

## Multi-platform in three lines

Combine providers to receive and send across platforms simultaneously:

```ts theme={null}
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";

const app = await Spectrum({
  providers: [
    imessage.config({ local: true }),
    terminal.config(),
  ],
});

for await (const [space, message] of app.messages) {
  await space.responding(async () => {
    await message.reply("Hello from Spectrum.");
  });
}
```

Messages from every provider merge into the single `app.messages` stream. The `message.platform` field identifies the source.

```