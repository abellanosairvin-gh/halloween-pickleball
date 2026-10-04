-- The black team is now called Dracula. Its id stays 'bat', so existing check-ins and pairs keep working.
update teams set name = 'Dracula' where id = 'bat';
