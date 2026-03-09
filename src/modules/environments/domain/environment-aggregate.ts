export const ENVIRONMENT_AREAS = ["adm", "mem", "ps"] as const;
export type EnvironmentArea = (typeof ENVIRONMENT_AREAS)[number];

export class EnvironmentAggregate {
  constructor(
    public readonly environmentId: string,
    public readonly area: EnvironmentArea,
    public readonly number: number,
    public readonly region: string,
    public readonly databaseHostUrl: string,
    public numConsecutiveFailures: number = 0,
    public readonly lastChecked?: Date,
  ) {}

  async checkHealth(): Promise<void> {
    const healthy = await fetch(
      `https://ephemeral-${this.area}${this.number}.${this.region}.devops.takecommand.us/sign-in`,
    ).then((res) => res.ok);

    if (healthy) {
      this.numConsecutiveFailures = 0;
    } else {
      this.numConsecutiveFailures += 1;
    }
  }
}
