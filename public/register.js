import { request } from "/common.js";

const form = document.getElementById("register-form");

async function hydrate() {
  const data = await request("/api/state");
  form.caretakerName.value = data.caretaker.name;
  form.phone.value = data.caretaker.phone;
  form.patientName.value = data.patient.name;
  form.relationship.value = data.patient.relationship || "Grandmother";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(form).entries());
  await request("/api/profile", {
    method: "POST",
    body: JSON.stringify(body)
  });
  window.location.href = "/dashboard";
});

hydrate().catch(() => {});
