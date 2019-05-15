import * as React from 'react';
import { render } from 'react-dom';
import { DateObjectSummary, JobState, ProcessMessage } from './Contract';

const App = () => {
    const dates = React.useMemo(() => {
        const nowDate = new Date();
        const modifyDate = new Date(nowDate);
        const showBeforeMonth = nowDate.getDate() <= 10;
        const baseMonth = showBeforeMonth ? modifyDate.getMonth() - 1 : modifyDate.getMonth();
        modifyDate.setMonth(baseMonth, 10);

        const ds = [...Array(31).keys()]
            .map((v) => modifyDate.getTime() + v * 86400000)
            .filter((v) => v <= nowDate.getTime())
            .map((v) => {
                const d = new Date(v);
                return { year: d.getFullYear(), month: d.getMonth() + 1, date: d.getDate() };
            });
        return ds;
    }, []);

    const [selected, setSelected] = React.useState(
        [...Array(dates.length).keys()].map((_) => false)
    );

    const [jobState, setJobState] = React.useState<Array<{ state: JobState; next: JobState }>>(
        [...Array(dates.length).keys()].map((_) => ({ state: -1, next: -1 }))
    );

    const selectedDates = React.useMemo(
        () =>
            selected
                .map((v, i) => [v, i])
                .filter((v) => v[0])
                .map((v) => v[1] as number)
                .map((v) => ({ ...dates[v], index: v })),
        [selected, dates]
    );

    const callback = React.useCallback(
        (b, i) =>
            setSelected((v) => {
                const newArr = [...v];
                newArr[i] = b;
                return newArr;
            }),
        []
    );

    const selectAllWeekday = React.useCallback(() => {
        const first = dates[0];
        const d = new Date(first.year, first.month - 1, first.date);
        const day = d.getDay();

        setSelected((v) => v.map((_, i) => (i + day) % 7 !== 0 && (i + day) % 7 !== 6));
    }, []);

    React.useEffect(() => {
        chrome.runtime.onMessage.addListener((message: ProcessMessage, _, sendMessage) => {
            if (message.type === 'B2P@ModifiedAttendance') {
                setJobState((v) => {
                    const newArr = [...v];
                    newArr[message.date.index] = {
                        state: message.date.state,
                        next: message.date.next,
                    };
                    return newArr;
                });
            }
            sendMessage();
        });
    }, []);

    return (
        <>
            {dates.map((v, i) => (
                <Cell
                    value={v}
                    checked={selected[i]}
                    key={i}
                    index={i}
                    cb={callback}
                    state={jobState[i]}
                />
            ))}
            <button
                onClick={() =>
                    chrome.runtime.sendMessage(
                        // tslint:disable-next-line: no-object-literal-type-assertion
                        {
                            type: 'P2B@SelectDates',
                            dates: selectedDates,
                        } as ProcessMessage
                    )
                }
            >
                送信
            </button>
            <button onClick={selectAllWeekday}>平日全選択</button>
        </>
    );
};

const weekStr = (day: number) => ['日', '月', '火', '水', '木', '金', '土'][day];

const Cell = ({
    value,
    checked,
    cb,
    index,
    state,
}: {
    value: DateObjectSummary;
    checked: boolean;
    cb: (b: boolean, i: number) => void;
    index: number;
    state: { state: JobState; next: JobState };
}) => {
    const d = new Date(value.year, value.month - 1, value.date);
    return (
        <div style={{ display: 'flex', alignItems: 'center' }}>
            <input
                type={'checkbox'}
                checked={checked}
                onChange={(b) => cb(b.target.checked, index)}
            />
            <p>
                {d.toLocaleDateString()}
                {`(${weekStr(d.getDay())})`}
            </p>
            <p>{getStateString(state)}</p>
        </div>
    );
};

const getStateString = ({ state, next }: { state: JobState; next: JobState }): string => {
    if (state === -1 && next === -1) {
        return '';
    }
    if (state === 0 && next === 3) {
        return '打刻修正申請済み';
    }
    if (state === 3) {
        return '打刻正常';
    }
    if (state === 1) {
        return '退勤忘れ';
    }
    if (state === 2) {
        return '出勤忘れ';
    }
    return '未定義の状態';
};

render(<App />, document.querySelector('#root'));
