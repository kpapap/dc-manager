/** State Model - used in App module */
export interface AppState {
    /** status visible - loading component */
    readonly loading: boolean;
    readonly token: string;
    readonly urlService: string;
}
