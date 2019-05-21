export interface DateObjectSummary {
    year: number;
    month: number;
    date: number;
}

export type ProcessMessage = SelectDatesMessage | ModifiedAttendanceMessage;

export interface SelectDatesMessage {
    type: 'P2B@SelectDates';
    dates: Array<DateObjectSummary & { index: number }>;
}

export type JobState = -1 | 0 | 1 | 2 | 3 | 4;

export interface ModifiedAttendanceMessage {
    type: 'B2P@ModifiedAttendance';
    date: DateObjectSummary & { index: number } & { state: JobState; next: JobState };
}
