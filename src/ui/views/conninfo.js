module.exports = view(connection =>
    div(() =>
        pass(connection.infoText(), ' ', function() {
        	if (connection.state === 'connect_failed') { span({class:'material-icons'}, 'error_outline'); }
        	if (connection.state === 'connecting') { span({class:'material-icons spin'}, 'donut_large'); }
        	if (connection.state === 'connected') { return span({class:'material-icons'}, 'check_circle'); }
        })
    )
);
