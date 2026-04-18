import { createApp } from "./src/app.mjs";

const port = Number(process.env.PORT || 3000);
const { server } = createApp();

server.listen(port, () => {
  console.log(`Caretaker demo listening on http://localhost:${port}`);
});
