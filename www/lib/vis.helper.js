// view class
// used by emoncms visualisations
// handles zooming and panning of time based data
var view =
{
  start:0,
  end:0,
  first_data:0,
  pan_speed:0.2,
  limit_x:true,

  'zoomout':function ()
  {
    var time_window = this.end - this.start;
    var middle = this.start + time_window / 2;
    time_window = time_window * 2;
    
    this.start = middle - (time_window/2);
    this.end = middle + (time_window/2);
    
    if (this.limit_x && this.start<this.first_data) {
        this.start = this.first_data;
    }
    
    if (this.limit_x && this.end>this.now()) {
        this.end = this.now();
    }
  },

  'zoomin':function ()
  {
    var time_window = this.end - this.start;
    var middle = this.start + time_window / 2;
    time_window = time_window * 0.5;
    this.start = middle - (time_window/2);
    this.end = middle + (time_window/2);
  },

  'panright':function ()
  {
    var time_window = this.end - this.start;
    var shiftsize = time_window * view.pan_speed;
    var now = this.now();
    if (this.end + shiftsize > now && this.limit_x) {
      shiftsize = now - this.end;
    }
    this.start += shiftsize;
    this.end += shiftsize;
  },

  'panleft':function ()
  {
    var time_window = this.end - this.start;
    var shiftsize = time_window * view.pan_speed;
    if (this.start - shiftsize < this.first_data && this.limit_x) {
      shiftsize = this.start - this.first_data;
    }
    this.start -= shiftsize;
    this.end -= shiftsize;
  },

  'timewindow':function(time)
  {
    this.start = ((new Date()).getTime())-(3600000*24*time);    //Get start time
    this.end = (new Date()).getTime();    //Get end time
  },

  'calc_interval':function(npoints=600, min_interval=5, scaler=1000)
  {
    var interval = Math.round(((this.end - this.start)*(1/scaler))/npoints);
    var outinterval = this.round_interval(interval);
    
    if (outinterval<min_interval) outinterval = min_interval;
    if (!this.fixinterval) this.interval = outinterval;
    
    var intervalms = this.interval*scaler;
    this.start = Math.floor(this.start / intervalms) * intervalms;
    this.end = Math.ceil(this.end / intervalms) * intervalms;
  },
  
  'round_interval':function(interval)
  {
      var outinterval = 5;
      if (interval>5) outinterval = 5;
      if (interval>10) outinterval = 10;
      if (interval>15) outinterval = 15;
      if (interval>20) outinterval = 20;
      if (interval>30) outinterval = 30;
      if (interval>60) outinterval = 60;
      if (interval>120) outinterval = 120;
      if (interval>180) outinterval = 180;
      if (interval>300) outinterval = 300;
      if (interval>600) outinterval = 600;
      if (interval>900) outinterval = 900;
      if (interval>1200) outinterval = 1200;
      if (interval>1800) outinterval = 1800;
      if (interval>3600*1) outinterval = 3600*1;
      if (interval>3600*2) outinterval = 3600*2;
      if (interval>3600*3) outinterval = 3600*3;
      if (interval>3600*4) outinterval = 3600*4;
      if (interval>3600*5) outinterval = 3600*5;
      if (interval>3600*6) outinterval = 3600*6;
      if (interval>3600*12) outinterval = 3600*12;
      if (interval>3600*24) outinterval = 3600*24;
      if (interval>3600*36) outinterval = 3600*36;
      if (interval>3600*48) outinterval = 3600*48;
      if (interval>3600*72) outinterval = 3600*72;

      return outinterval;
  },

  'now':function()
  {
    var date = new Date();
    return date.getTime();
  }
}