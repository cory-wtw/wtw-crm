declare module "zipcodes/lib/codes.js" {
  export const codes: Record<
    string,
    {
      zip: string;
      city: string;
      state: string;
      latitude: number;
      longitude: number;
    }
  >;
}
