import QlogConnectionGroup from './ConnectionGroup';
import * as qlog01 from "@/data/QlogSchema01";
import * as qlog02 from "@/data/QlogSchema02";

export class QlogSchemaConverter {

    public static Convert01to02(input:QlogConnectionGroup):qlog02.IQLog {

        console.log("QlogConverter:Convert01to02 : Transforming draft-01 qlog file to draft-02 qlog", input);

        const output:qlog02.IQLog = {
            qlog_version: qlog02.Defaults.versionName,
            qlog_format: qlog02.LogFormat.JSON,

            title: input.title,
            description: input.description,

            summary: input.summary,

            traces: [],
        };
        
        output.traces = [];

        for ( const connection of input.getConnections() ) {

            const newTrace:qlog02.ITrace = {
                vantage_point: connection.vantagePoint,
                title: connection.title,
                description: connection.description,

                configuration: connection.configuration,
                common_fields: connection.commonFields !== undefined ? connection.commonFields : {},

                events: [],
            };

            const event_fields = connection.eventFieldNames;

            if ( event_fields === undefined || event_fields.length === 0 ) {

                if ( qlog02.Defaults.versionAliases.indexOf(input.version) >= 0 ) {
                    // already proper draft-02 trace, nothing to be done

                    console.warn("QlogConverter:Convert01to02 : trace was already draft-02, just using existing events", connection.getEvents());

                    newTrace.events = connection.getEvents() as any; // we're already draft-02, so this should be a proper array of raw qlog02.IEvent here, even though the type is still any[][]
                    output.traces.push( newTrace );
                    continue;
                }
                else {

                    console.error("QlogConverter:Convert01to02 : no event_fields found, shouldn't happen! Skipping", connection);
                    continue;
                }
            }

            output.traces.push( newTrace );

            // time format used to be implied from the name of the field in event_fields, now as the value of common_fields.time_format
            // note that the relative reference_time was already in common_fields, so no transformation is needed
            let timeIndex = event_fields.indexOf("relative_time");
            if ( timeIndex === -1 ) {
                timeIndex = event_fields.indexOf("delta_time");
                if ( timeIndex === -1 ) { 
                    timeIndex = event_fields.indexOf("time");
                    newTrace.common_fields!.time_format = qlog02.TimeFormat.absolute;
                }
                else {
                    newTrace.common_fields!.time_format = qlog02.TimeFormat.delta;
                }
            }
            else {
                newTrace.common_fields!.time_format = qlog02.TimeFormat.relative;
            }

            // major change in draft-02 is getting rid of event_fields and using normal JSON field names instead
            const categoryIndex = event_fields.indexOf("category");
            let typeIndex = event_fields.indexOf("event_type");
            if ( typeIndex < 0 ) {
                typeIndex = event_fields.indexOf("event");
            }
            const dataIndex = event_fields.indexOf("data");
            const triggerIndex = event_fields.indexOf("trigger");

            if ( timeIndex < 0 || categoryIndex < 0 || typeIndex < 0 || dataIndex < 0 ) {
                console.error("QlogConverter:Convert01to02 : expected fields time/category/event/data not found, skipping. ", timeIndex, categoryIndex, typeIndex, dataIndex);
                continue;
            }

            for ( const event of connection.getEvents() ) {

                // could use EventParser here, but since we've looked up the event_fields indices ourselves, just use the raw data instead

                const newEvent:qlog02.IEvent = {

                    time: event[ timeIndex ],
                    name: event[ categoryIndex ] + ":" + event[ typeIndex ],
                    data: event[ dataIndex ],

                };

                newEvent.data = QlogSchemaConverter.Convert01to02EventData( newEvent.data as qlog01.EventData );

                if ( triggerIndex >= 0 ) {
                    (newEvent.data as any).trigger = event[ triggerIndex ];
                }

                newTrace.events.push( newEvent );
            }
        }

        // note: this is the raw JSON. to get a connectionGroup for some reason, use QlogLoaderV2 on this output
        return output;
    }

    private static Convert01to02EventData( input:qlog01.EventData ): qlog02.EventData {

        const output:qlog02.EventData = {};

        for ( const key of Object.keys(input) ) {
            (output as any)[key] = (input as any)[key];
        }

        const rawInput = input as any;
        const rawOutput = output as any;

        if ( rawInput.packet_type ) {
            if ( !rawOutput.header ) {
                rawOutput.header = {};
            }

            rawOutput.header.packet_type = rawInput.packet_type;
            delete rawOutput.packet_type; // to enforce proper draft-02 structure
        }

        if ( rawInput.header && rawInput.header.packet_size ) {
            if ( !rawOutput.raw ) {
                rawOutput.raw = {};
            }

            rawOutput.raw.length = rawOutput.header.packet_size;
            delete rawOutput.header.packet_size; // to enforce proper draft-02 structure
        }

        // TODO: add other 01 to 02 changes for individual events 

        return output;
    }
}
