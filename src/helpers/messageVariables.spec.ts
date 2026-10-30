import { describe, expect, it } from "vitest";
import { defaultMessageVariableSettings, MESSAGE_VARIABLE_CRM_SOURCES, resolveMessageVariables, validateMessageVariables, withDefaultMessageVariables, type MessageVariableDefinition } from "./messageVariables";

describe("message variables", () => {
  it("preserves the built-in CRM variables", () => {
    expect(resolveMessageVariables({ name: "La Posada", contact: "Ana", type: "Alojamientos" })).toMatchObject({
      name: "La Posada", contact: "Ana", type: "Alojamientos",
    });
  });

  it("offers the assigned sender's email as a CRM source",()=>{
    expect(MESSAGE_VARIABLE_CRM_SOURCES).toContainEqual(['sender_email','Email del responsable']);
    expect(resolveMessageVariables({sender_email:'responsable@example.com'},defaultMessageVariableSettings()).sender_email).toBe('responsable@example.com');
  });

  it("chooses the most specific applicable text and resolves nested variables", () => {
    const definitions: MessageVariableDefinition[] = [
      { key: "saludo", label: "Saludo", description: "", source: { kind: "text", key: "" }, active: true, alternatives: [
        { id: "generic", text: "Hola", conditions: {} },
        { id: "hotel", text: "Buen día, {{contact}}", conditions: { verticals: ["Alojamientos"], businessType: "Hotel" } },
      ] },
      { key: "apertura", label: "Apertura", description: "", source: { kind: "text", key: "" }, active: true, alternatives: [
        { id: "nested", text: "{{saludo}}. Te escribo de Hospeda.", conditions: {} },
      ] },
    ];

    const values = resolveMessageVariables({ contact: "Ana", type: "Alojamientos", subtype: "Hotel" }, definitions);
    expect(values.apertura).toBe("Buen día, Ana. Te escribo de Hospeda.");
  });

  it("resolves date and greeting from Argentina local time", () => {
    const definitions: MessageVariableDefinition[] = [
      { key: "saludo", label: "Saludo", description: "", source: { kind: "system", key: "greeting" }, active: true, alternatives: [] },
      { key: "dia", label: "Día", description: "", source: { kind: "system", key: "weekday" }, active: true, alternatives: [] },
    ];
    const values = resolveMessageVariables({}, definitions, new Date("2026-10-19T15:00:00.000Z"));
    expect(values.saludo).toBe("Buenas tardes");
    expect(values.dia).toBe("lunes");
  });

  it("ships the October 2026 catalog as built-in variables", () => {
    const values = resolveMessageVariables({ __seed: "catalog", contact: "Ana María", contact_first: "Ana", sender: "Leandro Pérez", sender_short: "Leo", channel: "whatsapp", commercialProfile: "Independiente", city: "Colón", type: "Alojamientos" }, defaultMessageVariableSettings(), new Date("2026-10-19T11:00:00.000Z"));
    expect(values.saludo).toMatch(/Ana/);
    expect(values.saludo).not.toMatch(/María|tardes|noches/);
    expect(values.presentacion).toMatch(/^(Soy Leo|Mi nombre es Leo)/);
    expect(values.presentacion).toContain("plataforma turística integral del Litoral");
    expect(values.ref_ciudad).toMatch(/^en Colón, /);
    expect(values.link_presentacion).toBe("https://hospeda.com.ar/es/presentacion/alojamientos/");
    expect(values.telefono_hospeda).toBe("3442 470650");
  });

  it("does not re-add defaults to a previously saved catalog", () => {
    const saved = defaultMessageVariableSettings().filter(variable => variable.key !== "despedida").map(variable => variable.key === "saludo" ? { ...variable, active: false } : variable);
    const merged = withDefaultMessageVariables(saved);
    expect(merged.find(variable => variable.key === "saludo")?.active).toBe(false);
    expect(merged.some(variable => variable.key === "despedida")).toBe(false);
  });

  it("chooses deterministically among equally specific alternatives and honors previous picks",()=>{
    const defs:MessageVariableDefinition[]=[{key:'saludo',label:'Saludo',description:'',source:{kind:'text',key:''},active:true,alternatives:[{id:'a',text:'A',conditions:{channel:'email'}},{id:'b',text:'B',conditions:{channel:'email'}}]}];
    expect(resolveMessageVariables({channel:'email',__seed:'same'},defs).saludo).toBe(resolveMessageVariables({channel:'email',__seed:'same'},defs).saludo);
    const seen=new Set(Array.from({length:20},(_,i)=>resolveMessageVariables({channel:'email',__seed:`seed-${i}`},defs).saludo));
    expect(seen.size).toBe(2);
    const picks={saludo:'a'};
    expect(resolveMessageVariables({channel:'email',__seed:'same',__previousPicks:picks},defs).saludo).toBe('B');
  });

  it("matches city accents while preserving ñ, profile absence and purpose conditions",()=>{
    const defs:MessageVariableDefinition[]=[{key:'texto',label:'Texto',description:'',source:{kind:'text',key:''},active:true,alternatives:[{id:'city',text:'Ciudad',conditions:{cities:['Café']}},{id:'none',text:'Sin perfil',conditions:{commercialProfiles:['none'],purpose:'first_contact'}}]}];
    expect(resolveMessageVariables({city:'Cafe',commercialProfile:'',purpose:'first_contact'},defs).texto).toBe('Sin perfil');
    expect(resolveMessageVariables({city:'Café',commercialProfile:'Referente'},defs).texto).toBe('Ciudad');
    expect(resolveMessageVariables({city:'Cabanas',commercialProfile:'Referente'},[{...defs[0],alternatives:[{id:'n',text:'N',conditions:{cities:['Cabañas']}}]}]).texto).toBe('');
  });

  it("uses Argentina weekday and month near UTC midnight",()=>{
    const definitions:MessageVariableDefinition[]=[{key:'fecha',label:'Fecha',description:'',source:{kind:'text',key:''},active:true,alternatives:[{id:'argentina',text:'local',conditions:{weekdays:[6],months:[10]}},{id:'fallback',text:'other',conditions:{}}]}];
    expect(resolveMessageVariables({__seed:'x'},definitions,new Date('2026-11-01T01:30:00.000Z')).fecha).toBe('local');
  });

  it("accepts multiple alternatives with identical conditions",()=>{
    const variable=defaultMessageVariableSettings()[5];
    expect(()=>validateMessageVariables([{...variable,alternatives:[...variable.alternatives,{id:'other',text:'Hola también',conditions:{dayPeriod:'morning'}}]}])).not.toThrow();
  });

  it('matches multiple profile and vertical values and counts each list as one specificity condition',()=>{
    const defs:MessageVariableDefinition[]=[{key:'texto',label:'Texto',description:'',source:{kind:'text',key:''},active:true,alternatives:[
      {id:'lists',text:'Lista',conditions:{verticals:['Alojamientos','Experiencias'],commercialProfiles:['Independiente','Referente']}},
      {id:'more-specific',text:'Más específica',conditions:{verticals:['Alojamientos'],commercialProfiles:['Referente'],channel:'email'}},
    ]}];
    expect(resolveMessageVariables({type:'Experiencia',commercialProfile:'Independiente',channel:'social',__seed:'x'},defs).texto).toBe('Lista');
    expect(resolveMessageVariables({type:'Alojamiento',commercialProfile:'Referente',channel:'email',__seed:'x'},defs).texto).toBe('Más específica');
  });

  it('normalizes stored legacy single vertical and profile conditions into lists',()=>{
    const variable=defaultMessageVariableSettings()[5];
    const legacy:unknown=[{...variable,alternatives:[{id:'legacy',text:'Legacy',conditions:{vertical:'Alojamiento',commercialProfile:'Referente'}}]}];
    expect(validateMessageVariables(legacy).at(-1)?.alternatives[0].conditions).toMatchObject({verticals:['Alojamiento'],commercialProfiles:['Referente']});
  });

  it('matches canonical known vertical aliases but keeps ñ distinct from n',()=>{
    const variable:MessageVariableDefinition={key:'texto',label:'Texto',description:'',source:{kind:'text',key:''},active:true,alternatives:[{id:'vertical',text:'Coincide',conditions:{verticals:['Proveedores de servicios']}}]};
    expect(resolveMessageVariables({type:'Proveedor de servicios'},[variable]).texto).toBe('Coincide');
    expect(resolveMessageVariables({type:'PROVEEDÓR DE SERVÍCIOS'},[variable]).texto).toBe('Coincide');
    expect(resolveMessageVariables({type:'Cabañas'},[{...variable,alternatives:[{id:'n',text:'No coincide',conditions:{verticals:['Cabanas']}}]}]).texto).toBe('');
  });

  it("ignores removed printable CRM sources in legacy stored settings",()=>{
    const legacy=defaultMessageVariableSettings().concat([{key:'legacy',label:'Legacy',description:'',source:{kind:'crm',key:'is_client'},alternatives:[],active:true} as MessageVariableDefinition]);
    expect(withDefaultMessageVariables(legacy).find(v=>v.key==='legacy')).toBeDefined();
  });

  it("rejects invalid or duplicate variable identifiers and unsafe CRM fields", () => {
    const defaults = defaultMessageVariableSettings();
    expect(() => validateMessageVariables([...defaults, { ...defaults[0] }])).toThrow(/único/);
    expect(() => validateMessageVariables([{ ...defaults[0], key: "dato", source: { kind: "crm", key: "password" } }])).toThrow(/no está permitido/);
  });
});
