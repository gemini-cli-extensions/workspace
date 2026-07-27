import { googleJson } from "../googleClient";

export type Person = {
  resourceName: string;
  names?: unknown[];
  emailAddresses?: unknown[];
  phoneNumbers?: unknown[];
  organizations?: unknown[];
};

const BASE = "https://people.googleapis.com/v1";

export class PeopleService {
  constructor(private env: Env, private sub: string) {}

  async getContact(resourceName: string, personFields = "names,emailAddresses,phoneNumbers,organizations"): Promise<Person> {
    return googleJson<Person>(this.env, this.sub, `${BASE}/${resourceName}?personFields=${encodeURIComponent(personFields)}`);
  }

  async listConnections(
    pageSize = 50,
    personFields = "names,emailAddresses",
  ): Promise<{ connections: Person[]; nextPageToken?: string; totalPeople?: number }> {
    const params = new URLSearchParams({
      pageSize: String(pageSize),
      personFields,
      sortOrder: "LAST_MODIFIED_DESCENDING",
    });
    return googleJson(this.env, this.sub, `${BASE}/people/me/connections?${params}`);
  }

  async searchContacts(query: string, readMask = "names,emailAddresses"): Promise<{ results: { person: Person }[] }> {
    const params = new URLSearchParams({ query, readMask });
    return googleJson(this.env, this.sub, `${BASE}/people:searchContacts?${params}`);
  }

  async searchDirectory(query: string, readMask = "names,emailAddresses"): Promise<{ people: Person[] }> {
    const params = new URLSearchParams({ query, readMask, sources: "DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE" });
    return googleJson(this.env, this.sub, `${BASE}/people:searchDirectoryPeople?${params}`);
  }

  async createContact(person: {
    names?: { givenName?: string; familyName?: string }[];
    emailAddresses?: { value: string }[];
    phoneNumbers?: { value: string }[];
  }): Promise<Person> {
    return googleJson<Person>(this.env, this.sub, `${BASE}/people:createContact`, {
      method: "POST",
      body: JSON.stringify(person),
    });
  }
}
